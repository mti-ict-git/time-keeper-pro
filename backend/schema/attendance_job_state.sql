IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AttendanceJobState')
BEGIN
  CREATE TABLE dbo.AttendanceJobState (
    JobName               NVARCHAR(100) NOT NULL PRIMARY KEY,
    LastProcessedTrDateTime DATETIME      NULL,
    LastProcessedCardNo   NVARCHAR(50)  NULL,
    LastRunAt             DATETIME      NULL,
    LastError             NVARCHAR(MAX) NULL
  );
END;
