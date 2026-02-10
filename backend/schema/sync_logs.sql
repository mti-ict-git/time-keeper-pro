IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncLogs')
BEGIN
  CREATE TABLE SyncLogs (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    timestamp DATETIME NOT NULL DEFAULT(GETDATE()),
    total INT NOT NULL,
    updated INT NOT NULL,
    inserted INT NOT NULL,
    unchanged INT NOT NULL,
    success BIT NOT NULL,
    error NVARCHAR(MAX) NULL,
    detailsUpdated NVARCHAR(MAX) NULL,
    detailsInserted NVARCHAR(MAX) NULL,
    runId UNIQUEIDENTIFIER NULL
  )
END
