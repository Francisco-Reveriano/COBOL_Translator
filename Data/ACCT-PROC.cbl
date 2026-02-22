       IDENTIFICATION DIVISION.
       PROGRAM-ID. ACCT-PROC.
       AUTHOR. TRUIST-LEGACY.
      *
      * Account Processing Module
      * Reads customer account records and calculates balances
      *
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT ACCT-FILE ASSIGN TO 'ACCTDATA'
               ORGANIZATION IS SEQUENTIAL
               ACCESS MODE IS SEQUENTIAL
               FILE STATUS IS WS-FILE-STATUS.
           SELECT REPORT-FILE ASSIGN TO 'RPTDATA'
               ORGANIZATION IS SEQUENTIAL
               ACCESS MODE IS SEQUENTIAL.

       DATA DIVISION.
       FILE SECTION.
       FD ACCT-FILE.
       01 ACCT-RECORD.
           05 ACCT-NUMBER        PIC X(10).
           05 ACCT-NAME          PIC X(30).
           05 ACCT-TYPE          PIC X(02).
               88 CHECKING       VALUE 'CH'.
               88 SAVINGS        VALUE 'SV'.
               88 MONEY-MARKET   VALUE 'MM'.
           05 ACCT-BALANCE       PIC S9(9)V99 COMP-3.
           05 ACCT-OPEN-DATE     PIC 9(8).
           05 ACCT-STATUS        PIC X(01).
               88 ACTIVE         VALUE 'A'.
               88 CLOSED         VALUE 'C'.
               88 FROZEN         VALUE 'F'.

       FD REPORT-FILE.
       01 REPORT-RECORD          PIC X(132).

       WORKING-STORAGE SECTION.
       01 WS-FILE-STATUS         PIC XX.
       01 WS-EOF-FLAG            PIC X VALUE 'N'.
           88 END-OF-FILE        VALUE 'Y'.
       01 WS-RECORD-COUNT        PIC 9(7) VALUE ZEROS.
       01 WS-TOTAL-BALANCE       PIC S9(13)V99 COMP-3 VALUE ZEROS.
       01 WS-ACTIVE-COUNT        PIC 9(7) VALUE ZEROS.
       01 WS-AVG-BALANCE         PIC S9(9)V99 VALUE ZEROS.

       01 WS-INTEREST-RATE.
           05 WS-CHECK-RATE      PIC 9V9999 VALUE 0.0025.
           05 WS-SAVE-RATE       PIC 9V9999 VALUE 0.0450.
           05 WS-MM-RATE         PIC 9V9999 VALUE 0.0500.

       01 WS-CALC-FIELDS.
           05 WS-INTEREST-AMT    PIC S9(9)V99 COMP-3.
           05 WS-NEW-BALANCE     PIC S9(9)V99 COMP-3.

       01 WS-REPORT-LINE.
           05 RPT-ACCT-NUM       PIC X(10).
           05 FILLER             PIC X(02) VALUE SPACES.
           05 RPT-ACCT-NAME      PIC X(30).
           05 FILLER             PIC X(02) VALUE SPACES.
           05 RPT-BALANCE        PIC Z,ZZZ,ZZ9.99-.
           05 FILLER             PIC X(02) VALUE SPACES.
           05 RPT-INTEREST       PIC Z,ZZZ,ZZ9.99-.
           05 FILLER             PIC X(02) VALUE SPACES.
           05 RPT-NEW-BAL        PIC Z,ZZZ,ZZ9.99-.

       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM 1000-INITIALIZE
           PERFORM 2000-PROCESS-RECORDS
               UNTIL END-OF-FILE
           PERFORM 3000-CALCULATE-SUMMARY
           PERFORM 9000-TERMINATE
           STOP RUN.

       1000-INITIALIZE.
           OPEN INPUT ACCT-FILE
           OPEN OUTPUT REPORT-FILE
           IF WS-FILE-STATUS NOT = '00'
               DISPLAY 'ERROR OPENING FILES: ' WS-FILE-STATUS
               STOP RUN
           END-IF
           PERFORM 1100-READ-RECORD.

       1100-READ-RECORD.
           READ ACCT-FILE
               AT END
                   SET END-OF-FILE TO TRUE
               NOT AT END
                   ADD 1 TO WS-RECORD-COUNT
           END-READ.

       2000-PROCESS-RECORDS.
           IF ACTIVE
               ADD 1 TO WS-ACTIVE-COUNT
               PERFORM 2100-CALCULATE-INTEREST
               PERFORM 2200-WRITE-REPORT-LINE
           END-IF
           PERFORM 1100-READ-RECORD.

       2100-CALCULATE-INTEREST.
           EVALUATE TRUE
               WHEN CHECKING
                   COMPUTE WS-INTEREST-AMT ROUNDED =
                       ACCT-BALANCE * WS-CHECK-RATE
               WHEN SAVINGS
                   COMPUTE WS-INTEREST-AMT ROUNDED =
                       ACCT-BALANCE * WS-SAVE-RATE
               WHEN MONEY-MARKET
                   COMPUTE WS-INTEREST-AMT ROUNDED =
                       ACCT-BALANCE * WS-MM-RATE
               WHEN OTHER
                   MOVE ZEROS TO WS-INTEREST-AMT
           END-EVALUATE
           COMPUTE WS-NEW-BALANCE =
               ACCT-BALANCE + WS-INTEREST-AMT
           ADD ACCT-BALANCE TO WS-TOTAL-BALANCE.

       2200-WRITE-REPORT-LINE.
           MOVE ACCT-NUMBER   TO RPT-ACCT-NUM
           MOVE ACCT-NAME     TO RPT-ACCT-NAME
           MOVE ACCT-BALANCE  TO RPT-BALANCE
           MOVE WS-INTEREST-AMT TO RPT-INTEREST
           MOVE WS-NEW-BALANCE TO RPT-NEW-BAL
           WRITE REPORT-RECORD FROM WS-REPORT-LINE.

       3000-CALCULATE-SUMMARY.
           IF WS-ACTIVE-COUNT > ZEROS
               COMPUTE WS-AVG-BALANCE ROUNDED =
                   WS-TOTAL-BALANCE / WS-ACTIVE-COUNT
           END-IF
           DISPLAY 'RECORDS PROCESSED: ' WS-RECORD-COUNT
           DISPLAY 'ACTIVE ACCOUNTS:   ' WS-ACTIVE-COUNT
           DISPLAY 'TOTAL BALANCE:     ' WS-TOTAL-BALANCE
           DISPLAY 'AVERAGE BALANCE:   ' WS-AVG-BALANCE.

       9000-TERMINATE.
           CLOSE ACCT-FILE
           CLOSE REPORT-FILE.
