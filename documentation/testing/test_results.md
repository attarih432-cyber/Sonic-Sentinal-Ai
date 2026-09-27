# Test Execution Detailed Results

1. `TEST 1`: Public signup -> role=user [PASS]
2. `TEST 2`: Client role=admin ignored [PASS]
3. `TEST 3`: User blocked from /api/admin [PASS]
4. `TEST 4`: Admin API -> 403 for user [PASS]
5. `TEST 5`: Admin login -> success [PASS]
6. `TEST 6`: Admin wrong password -> rejected [PASS]
7. `TEST 7`: Admin can view users [PASS]
8. `TEST 8`: User cannot view users list [PASS]
9. `TEST 9`: User data isolation [PASS]
10. `TEST 10`: No credentials in API response [PASS]
11. `TEST 11`: Password stored hashed (PBKDF2-SHA256) [PASS]
12. `TEST 12`: No duplicate admin on re-run [PASS]
