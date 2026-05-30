IF COL_LENGTH('dbo.tblAttendanceReport', 'PushedAt') IS NULL
BEGIN
  ALTER TABLE dbo.tblAttendanceReport ADD PushedAt DATETIME NULL;
END;
