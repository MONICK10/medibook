# MediBook

A small app to book doctor appointments. Made for learning.

**All data is fake. Do not enter real patient information.**

## What it does

1. Shows a list of 3 doctors.
2. Lets a patient book an appointment (name, phone, doctor, date, time).
3. Shows a list of all bookings.
4. Lets a patient upload a medical report (PDF or image) for a booking.

## Folders

```
medibook/
  backend/     The server (Node.js + Express). Runs on port 3000.
    server.js    Starts the server and defines the API routes.
    db.js        Stores bookings (in memory for now, PostgreSQL later).
    storage.js   Saves uploaded files (in backend/uploads/ for now, AWS S3 later).
  frontend/    The web page (React + Vite). Runs on port 5173.
    src/config.js  The backend address (API_URL).
    src/App.jsx    The main page.
    src/components/  The smaller parts of the page.
  README.md
  .gitignore
```

## What you need first

- **Node.js** version 18 or newer. Check it by typing:

  ```
  node --version
  ```

  If you do not have it, download it from https://nodejs.org

## How to run the app

You need **two terminal windows**: one for the backend, one for the frontend.

### Step 1: Start the backend

Open the first terminal and type:

```
cd medibook/backend
npm install
npm start
```

You should see:

```
MediBook backend running on http://localhost:3000
```

Test it: open http://localhost:3000/api/health in your browser.
You should see `{"status":"ok"}`.

Leave this terminal open.

### Step 2: Start the frontend

Open a second terminal and type:

```
cd medibook/frontend
npm install
npm run dev
```

You should see a line like:

```
Local:   http://localhost:5173/
```

Open http://localhost:5173 in your browser. You will see the MediBook page.

### Step 3: Try it

1. Look at the doctors in section 1.
2. Fill in the form in section 2 and click **Book Appointment**.
   Use a fake name and a fake 10-digit phone number, like `9000000000`.
3. Your booking appears in the **All Bookings** table.
4. In section 3, choose your booking, pick a PDF or image file, and click **Upload Report**.
   The file is saved in `backend/uploads/`.

### Step 4: Stop the app

In each terminal, press **Ctrl + C**.

## Important notes

- Bookings are kept in memory. **When you stop the backend, all bookings are deleted.**
  (Uploaded files stay in `backend/uploads/`.)
- Uploads must be PDF, PNG or JPG, and smaller than 5 MB.

## Changing settings (optional)

**Backend port.** The backend uses port 3000. To use another port, set `PORT` before starting:

- Windows (PowerShell): `$env:PORT=4000; npm start`
- Mac / Linux: `PORT=4000 npm start`

**Backend address for the frontend.** If the backend is not at http://localhost:3000,
create a file called `.env` inside the `frontend` folder with this line:

```
VITE_API_URL=http://localhost:4000
```

Then stop the frontend (Ctrl + C) and run `npm run dev` again.

## API routes

| Method | URL                 | What it does                   |
| ------ | ------------------- | ------------------------------ |
| GET    | `/api/health`       | Returns `{ "status": "ok" }`   |
| GET    | `/api/doctors`      | Lists the 3 doctors            |
| POST   | `/api/appointments` | Saves a booking                |
| GET    | `/api/appointments` | Lists all bookings             |
| POST   | `/api/reports`      | Uploads a report file (multer) |
