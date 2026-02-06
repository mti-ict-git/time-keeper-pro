IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncSettings')
BEGIN
  CREATE TABLE SyncSettings (
    id INT NOT NULL PRIMARY KEY,
    enabled BIT NOT NULL DEFAULT(1),
    intervalMinutes INT NOT NULL DEFAULT(5),
    updatedAt DATETIME NOT NULL DEFAULT(GETDATE())
  );
END;
