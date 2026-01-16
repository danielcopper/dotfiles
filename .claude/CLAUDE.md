- Never use "Coauthored by" or "Generated with" or similar Claude mentions ins commit messages
- no actually you where being honest thatyou cannot read the image. but then you still start implementing some ugly whatever. why? you started off great and then threw this overboard just to produce some output?
aksing is always better. i can provide the anwers most of the tiem. i do never wnat content for the sake of content
- Always use LF line endings, never CRLF (we are on Linux)
- SQL Server docker container (sqlserver2022) on localhost:1433, user `sa`, password `Admin123!`
  - ALWAYS use double quotes for the password: `-P "Admin123!"`
  - CRITICAL: Never use single quotes ANYWHERE in the command when password contains `!`
  - For SQL string literals, use escaped double quotes `\"value\"` instead of `'value'`
  - Example: `sqlcmd -S localhost -U sa -P "Admin123!" -C -Q "SELECT * FROM t WHERE name LIKE \"%pattern%\""`
  - Wrong: `... WHERE name LIKE '%pattern%'` (single quotes break the password!)