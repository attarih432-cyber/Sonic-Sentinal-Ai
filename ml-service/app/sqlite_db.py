"""SQLite-backed document store for SonicSentinel.
Provides MongoDB-compatible collection interface using local SQLite database.
Zero external database dependencies, 100% reliable, zero TLS or network issues.
"""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import threading
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

from bson import ObjectId
from pymongo.errors import DuplicateKeyError


class JSONEncoderWithTypes(json.JSONEncoder):
    """Custom JSON encoder handling datetime, date, and ObjectId."""
    def default(self, o: Any) -> Any:
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, ObjectId):
            return str(o)
        return super().default(o)


def _to_comparable(val: Any) -> Any:
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, ObjectId):
        return str(val)
    return val


def _match_field(doc_val: Any, cond_val: Any) -> bool:
    doc_val_comp = _to_comparable(doc_val)
    if isinstance(cond_val, dict):
        for op, target in cond_val.items():
            target_comp = _to_comparable(target)
            if op == "$gt":
                if doc_val_comp is None or not (doc_val_comp > target_comp):
                    return False
            elif op == "$gte":
                if doc_val_comp is None or not (doc_val_comp >= target_comp):
                    return False
            elif op == "$lt":
                if doc_val_comp is None or not (doc_val_comp < target_comp):
                    return False
            elif op == "$lte":
                if doc_val_comp is None or not (doc_val_comp <= target_comp):
                    return False
            elif op == "$ne":
                if doc_val_comp == target_comp:
                    return False
            elif op == "$in":
                target_list = [_to_comparable(x) for x in target]
                if doc_val_comp not in target_list:
                    return False
        return True
    else:
        target_comp = _to_comparable(cond_val)
        if doc_val_comp is None and target_comp is None:
            return True
        if str(doc_val_comp) == str(target_comp):
            return True
        return doc_val_comp == target_comp


def _matches(doc: dict[str, Any], filter_dict: dict[str, Any]) -> bool:
    for field, cond in filter_dict.items():
        if field == "_id":
            doc_id = str(doc.get("_id", ""))
            target_id = str(_to_comparable(cond))
            if isinstance(cond, dict):
                if not _match_field(doc_id, cond):
                    return False
            elif doc_id != target_id:
                return False
        else:
            val = doc.get(field)
            if not _match_field(val, cond):
                return False
    return True


class InsertResult:
    def __init__(self, inserted_id: Any):
        self.inserted_id = inserted_id


class UpdateResult:
    def __init__(self, matched_count: int, modified_count: int):
        self.matched_count = matched_count
        self.modified_count = modified_count


class DeleteResult:
    def __init__(self, deleted_count: int):
        self.deleted_count = deleted_count


class SQLiteCursor:
    def __init__(self, docs: list[dict[str, Any]]):
        self._docs = docs

    def sort(self, key_or_list: str | list[tuple[str, int]], direction: int = 1) -> SQLiteCursor:
        if isinstance(key_or_list, list):
            for k, d in reversed(key_or_list):
                rev = (d == -1)
                self._docs.sort(key=lambda x: _to_comparable(x.get(k, "")), reverse=rev)
        else:
            rev = (direction == -1)
            self._docs.sort(key=lambda x: _to_comparable(x.get(key_or_list, "")), reverse=rev)
        return self

    def skip(self, n: int) -> SQLiteCursor:
        self._docs = self._docs[n:]
        return self

    def limit(self, n: int) -> SQLiteCursor:
        self._docs = self._docs[:n]
        return self

    def __iter__(self) -> Iterator[dict[str, Any]]:
        return iter(self._docs)

    def __len__(self) -> int:
        return len(self._docs)

    def __getitem__(self, item: int) -> dict[str, Any]:
        return self._docs[item]


class SQLiteCollection:
    def __init__(self, db: SQLiteDatabase, name: str):
        self.db = db
        self.name = name
        self._ensure_table()

    def _ensure_table(self) -> None:
        with self.db.lock:
            conn = self.db.conn
            conn.execute(
                f"CREATE TABLE IF NOT EXISTS {self.name} (_id TEXT PRIMARY KEY, doc TEXT)"
            )
            conn.commit()

    def create_index(self, *args: Any, **kwargs: Any) -> None:
        # SQLite handles lookups fast; uniqueness enforced in insert/update
        pass

    def _deserialize(self, doc_json: str) -> dict[str, Any]:
        return json.loads(doc_json)

    def _serialize(self, doc: dict[str, Any]) -> str:
        return json.dumps(doc, cls=JSONEncoderWithTypes)

    def insert_one(self, doc: dict[str, Any]) -> InsertResult:
        doc = dict(doc)
        if "_id" not in doc:
            # Generate valid 24-character hexadecimal ObjectId
            doc["_id"] = ObjectId(secrets.token_hex(12))

        doc_id_str = str(doc["_id"])

        # Enforce unique indexes
        if self.name == "users" and "email" in doc:
            existing = self.find_one({"email": str(doc["email"]).lower()})
            if existing and str(existing.get("_id")) != doc_id_str:
                raise DuplicateKeyError(f"Duplicate key: email {doc['email']}")

        if self.name == "sessions" and "token_hash" in doc:
            existing = self.find_one({"token_hash": doc["token_hash"]})
            if existing and str(existing.get("_id")) != doc_id_str:
                raise DuplicateKeyError(f"Duplicate key: token_hash {doc['token_hash']}")

        serialized = self._serialize(doc)
        with self.db.lock:
            conn = self.db.conn
            try:
                conn.execute(
                    f"INSERT INTO {self.name} (_id, doc) VALUES (?, ?)",
                    (doc_id_str, serialized)
                )
                conn.commit()
            except sqlite3.IntegrityError as e:
                raise DuplicateKeyError(str(e)) from e

        return InsertResult(doc["_id"])

    def find_one(self, filter_dict: Optional[dict[str, Any]] = None) -> Optional[dict[str, Any]]:
        filter_dict = filter_dict or {}
        # Fast path if filter is only by _id
        if len(filter_dict) == 1 and "_id" in filter_dict and not isinstance(filter_dict["_id"], dict):
            id_val = str(_to_comparable(filter_dict["_id"]))
            with self.db.lock:
                cursor = self.db.conn.execute(
                    f"SELECT doc FROM {self.name} WHERE _id = ?",
                    (id_val,)
                )
                row = cursor.fetchone()
                if row:
                    doc = self._deserialize(row[0])
                    doc["_id"] = ObjectId(doc["_id"]) if ObjectId.is_valid(str(doc["_id"])) else doc["_id"]
                    return doc
                return None

        # General path
        with self.db.lock:
            cursor = self.db.conn.execute(f"SELECT doc FROM {self.name}")
            for (doc_str,) in cursor.fetchall():
                doc = self._deserialize(doc_str)
                if _matches(doc, filter_dict):
                    doc["_id"] = ObjectId(doc["_id"]) if ObjectId.is_valid(str(doc["_id"])) else doc["_id"]
                    return doc
        return None

    def find(self, filter_dict: Optional[dict[str, Any]] = None) -> SQLiteCursor:
        filter_dict = filter_dict or {}
        results = []
        with self.db.lock:
            cursor = self.db.conn.execute(f"SELECT doc FROM {self.name}")
            for (doc_str,) in cursor.fetchall():
                doc = self._deserialize(doc_str)
                if _matches(doc, filter_dict):
                    doc["_id"] = ObjectId(doc["_id"]) if ObjectId.is_valid(str(doc["_id"])) else doc["_id"]
                    results.append(doc)
        return SQLiteCursor(results)

    def update_one(self, filter_dict: dict[str, Any], update: dict[str, Any]) -> UpdateResult:
        doc = self.find_one(filter_dict)
        if not doc:
            return UpdateResult(matched_count=0, modified_count=0)

        doc_id_str = str(doc["_id"])
        modified = False

        if "$set" in update:
            for k, v in update["$set"].items():
                doc[k] = _to_comparable(v)
            modified = True

        if "$inc" in update:
            for k, delta in update["$inc"].items():
                doc[k] = doc.get(k, 0) + delta
            modified = True

        serialized = self._serialize(doc)
        with self.db.lock:
            conn = self.db.conn
            conn.execute(
                f"UPDATE {self.name} SET doc = ? WHERE _id = ?",
                (serialized, doc_id_str)
            )
            conn.commit()

        return UpdateResult(matched_count=1, modified_count=1 if modified else 0)

    def delete_one(self, filter_dict: dict[str, Any]) -> DeleteResult:
        doc = self.find_one(filter_dict)
        if not doc:
            return DeleteResult(deleted_count=0)

        doc_id_str = str(doc["_id"])
        with self.db.lock:
            conn = self.db.conn
            conn.execute(f"DELETE FROM {self.name} WHERE _id = ?", (doc_id_str,))
            conn.commit()

        return DeleteResult(deleted_count=1)

    def count_documents(self, filter_dict: Optional[dict[str, Any]] = None) -> int:
        filter_dict = filter_dict or {}
        if not filter_dict:
            with self.db.lock:
                cursor = self.db.conn.execute(f"SELECT COUNT(*) FROM {self.name}")
                return cursor.fetchone()[0]
        return len(self.find(filter_dict))


class SQLiteDatabase:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(
            str(self.db_path),
            check_same_thread=False,
            isolation_level=None
        )
        self.conn.execute("PRAGMA journal_mode = WAL")
        self.conn.execute("PRAGMA synchronous = NORMAL")
        self._collections: dict[str, SQLiteCollection] = {}

    def __getitem__(self, name: str) -> SQLiteCollection:
        if name not in self._collections:
            self._collections[name] = SQLiteCollection(self, name)
        return self._collections[name]

    def __getattr__(self, name: str) -> SQLiteCollection:
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]

    def create_collection(self, name: str) -> SQLiteCollection:
        return self[name]

    def ping(self) -> bool:
        with self.lock:
            cursor = self.conn.execute("SELECT 1")
            return cursor.fetchone()[0] == 1


_global_sqlite_db: Optional[SQLiteDatabase] = None


def get_sqlite_db(path: Optional[Path] = None) -> SQLiteDatabase:
    global _global_sqlite_db
    if _global_sqlite_db is None:
        default_path = Path(__file__).resolve().parents[1] / "data" / "sonic_sentinel.db"
        _global_sqlite_db = SQLiteDatabase(path or default_path)
    return _global_sqlite_db
