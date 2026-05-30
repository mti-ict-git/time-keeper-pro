IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'UX_tblAttendanceReport_Idempotency')
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM dbo.tblAttendanceReport
    WHERE StaffNo IS NOT NULL AND TrDateTime IS NOT NULL AND TrController IS NOT NULL AND ClockEvent IS NOT NULL
    GROUP BY StaffNo, TrDateTime, TrController, ClockEvent
    HAVING COUNT(*) > 1
  )
  BEGIN
    CREATE UNIQUE INDEX UX_tblAttendanceReport_Idempotency
      ON dbo.tblAttendanceReport (StaffNo, TrDateTime, TrController, ClockEvent)
      WHERE StaffNo IS NOT NULL AND TrDateTime IS NOT NULL AND TrController IS NOT NULL AND ClockEvent IS NOT NULL;
  END
END;
