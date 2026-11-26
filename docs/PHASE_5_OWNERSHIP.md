# Phase 5 · Smart documents and ownership

Open **Document Wallet** from Home or My Vehicles. Choose an owner or vehicle, a category, and a title. Dates and attachments are optional. For an attachment, the system picker accepts PDF, JPEG, PNG and WebP files up to 20 MB. The wallet displays images directly and uses the system to open PDFs. A compatible reader may be required. The document number is masked in the editor and omitted from list cards and reports.

Document metadata is in SQLite. Attachment files use generated names in app-private persistent storage. DriveSentry does not upload the files. App uninstall or clearing app storage can remove the wallet. The app does not add application-level encryption. When the device opens an attachment or shares a report, the selected receiving app can access that file.

SQLite migration 7 adds `ownership_documents`, `ownership_file_cleanup`, `ownership_reminder_settings`, and `ownership_expenses`. Vehicle deletion cascades to its documents and expenses, while owner documents remain. SQLite queues file deletion after document deletion or replacement. Failed file removals retry on foreground. Startup also removes unreferenced generated attachment files, such as a copy left behind if the app closed before saving its metadata.

Enable reminders under **Settings → Document expiry reminders**. Defaults are 30, 15, 7, 1 and 0 days before expiry. DriveSentry schedules the nearest 60 alerts at 9 am device-local time and reconciles them on reopening, reactivation, and document changes. Permission and delivery timing are controlled by the OS. Expiry warnings in the app are independent of notifications.

Open **Ownership Analytics** from Home or vehicle details. Add only expenses absent from Fuel and Maintenance. The analytics exclude planned services and use integer-paise amounts. Reports are scoped to one vehicle and the displayed date range. The system share sheet supports sending or saving them. The app retries temporary report cleanup on foreground after 24 hours, allowing time for recipients to read the shared files.

Android generates the PDF on-device with an embedded font and opens it in the system viewer. iOS uses Expo Print and the system share sheet.

## Verification

On the existing Android API 37 phone emulator with Expo Go, Tracker 400 remained available after upgrading the database. A fictional insurance PDF was imported, displayed an expiry warning in both themes, and opened from the wallet after restarting Expo Go. A temporary ₹250 road-tax expense appeared in Tracker 400's total and was isolated from a second vehicle. Android displayed the CSV share sheet and opened the generated PDF with the same ₹250 total. Enabling reminders completed successfully and Android's alarm output showed three matching notification records. The wallet entry, expense and second vehicle were removed after testing. Scheduled delivery and notification-tap routing were unverified. iOS runtime testing remains pending.
