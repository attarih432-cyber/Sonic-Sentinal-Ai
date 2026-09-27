# Data Dictionary

| Field | Type | Description |
| :--- | :--- | :--- |
| `path` | String | Relative audio file location |
| `label` | String | Target sound class (1 of 10) |
| `label_id` | Integer | Class index (0 through 9) |
| `duration_sec` | Float | Clip length in seconds |
| `sample_rate` | Integer | Audio sample rate (22050 Hz) |
| `group_id` | String | SHA-256 hash for exact deduplication |
