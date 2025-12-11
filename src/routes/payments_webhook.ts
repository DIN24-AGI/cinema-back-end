// src/routes/webhook.ts
import { Request, Response } from "express";
import Stripe from "stripe";
import { pool } from "../db";
import { sendTicketEmail } from "../utils/email";
import { getSeatsHub } from "../ws/seats";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import tz from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(tz);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Escape unsafe HTML (Gmail-safe)
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const webhookHandler = async (req: Request, res: Response) => {
  console.log("\n===================== WEBHOOK =====================");

  const sig = req.headers["stripe-signature"] as string;
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error(" Stripe signature error", err);
    return res.status(400).send("Bad signature");
  }

  if (event.type !== "checkout.session.completed") {
    return res.json({ received: true });
  }

  console.log("Checkout completed");

  const session = event.data.object as Stripe.Checkout.Session;
  const payment_uid = session.metadata?.payment_uid;
  const showtime_uid = session.metadata?.showtime_uid;
  const email = session.customer_details?.email ?? null;

  if (!payment_uid || !showtime_uid) {
    console.log(" Missing metadata");
    return res.json({ received: true });
  }

  try {
    // Update payment
    await pool.query(
      `UPDATE payment 
       SET status='paid', updated_at=NOW(), user_email=$2
       WHERE uid=$1`,
      [payment_uid, email]
    );

    //  Update reservations
    const updated = await pool.query(
      `UPDATE reservation
       SET status='paid', paid_at=NOW(), expires_at=NULL, user_email=$2
       WHERE payment_uid=$1
       RETURNING seat_uid`,
      [payment_uid, email]
    );

    const seatIds: string[] = updated.rows.map((r) => r.seat_uid);

    //  Websocket updates
    const hub = getSeatsHub();
    if (hub) {
      seatIds.forEach((s) => hub.broadcastSeatUpdate(showtime_uid, s, "paid"));
    }

    //  Fetch showtime, movie, hall info
    const showtimeData = await pool.query(
      `SELECT s.starts_at, s.ends_at, m.title AS movie_title, h.name AS hall_name
       FROM showtime s
       JOIN movie m ON m.uid = s.movie_uid
       JOIN hall h  ON h.uid = s.hall_uid
       WHERE s.uid = $1`,
      [showtime_uid]
    );

    const info = showtimeData.rows[0];
    const movieTitle = info.movie_title;
    const hallName = info.hall_name;

    const start = dayjs(info.starts_at).tz("Europe/Helsinki");
    const end = dayjs(info.ends_at).tz("Europe/Helsinki");

    const formattedDate = start.format("DD MMM YYYY");
    const formattedTime = `${start.format("HH:mm")}–${end.format("HH:mm")}`;

    // Fetch seat info
    const seatRows = await pool.query(
      `SELECT row, number FROM seat WHERE uid = ANY($1::uuid[])`,
      [seatIds]
    );

    const readableSeats = seatRows.rows
      .map((s) => `Row ${s.row}, Seat ${s.number}`)
      .join(", ");

    //=====================================================
    //  Generate QR PNG and save to /public/tickets/
    //=====================================================

    const qrPayload = `ticket:${payment_uid}:${showtime_uid}`;
    console.log("QR PAYLOAD =", qrPayload);

    const pngBuffer = await QRCode.toBuffer(qrPayload, {
      errorCorrectionLevel: "L",
      margin: 0,
      scale: 5,
      width: 300
    });

    const ticketsDir = path.join(__dirname, "..", "public", "tickets");

    if (!fs.existsSync(ticketsDir)) {
      fs.mkdirSync(ticketsDir, { recursive: true });
    }

    const filePath = path.join(ticketsDir, `${payment_uid}.png`);
    fs.writeFileSync(filePath, pngBuffer);

    const backendUrl = process.env.BACKEND_PUBLIC_URL!;
    const qrUrl = `${backendUrl}/tickets/${payment_uid}.png`;

    console.log("QR URL =", qrUrl);

    //=====================================================
    //  Build Email HTML
    //=====================================================

    const html = `
<div style="font-family:Arial, sans-serif; max-width:480px; margin:0 auto; padding:20px; background:#fafafa; border:1px solid #e0e0e0; border-radius:14px;">

  <h2 style="text-align:center; margin-bottom:6px;">🎬 Your Cinema Ticket</h2>

  <p style="text-align:center; color:#555; margin-top:0;">
    Thank you for your purchase!
  </p>

  <div style="background:white; padding:16px; border-radius:12px; border:1px solid #ddd; margin-top:16px;">
    <p><strong>Movie:</strong> ${escapeHtml(movieTitle)}</p>
    <p><strong>Date:</strong> ${formattedDate}</p>
    <p><strong>Time:</strong> ${formattedTime}</p>
    <p><strong>Hall:</strong> ${escapeHtml(hallName)}</p>
    <p><strong>Seats:</strong> ${escapeHtml(readableSeats)}</p>
  </div>

  <h3 style="text-align:center; margin-top:24px;">Your QR Code</h3>

  <div style="text-align:center;">
    <img src="${qrUrl}" style="width:220px;height:220px;border-radius:10px; border:1px solid #ccc;" />
  </div>

  <p style="text-align:center; color:#666; font-size:14px; margin-top:20px;">
    Please show this QR code at the entrance.
  </p>

</div>
    `;

    //=====================================================
    // Send Email
    //=====================================================
    if (email) await sendTicketEmail(email, "Your Cinema Ticket", html);

    console.log("✔ Ticket email sent");

  } catch (err) {
    console.error(" ERROR:", err);
    return res.status(500).send("Internal error");
  }

  res.json({ received: true });
};

export default webhookHandler;
