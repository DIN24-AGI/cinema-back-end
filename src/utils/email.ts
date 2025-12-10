import nodemailer from "nodemailer";

export const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,      
    pass: process.env.EMAIL_PASSWORD, 
  },
});

export async function sendTicketEmail(to: string, subject: string, html: string) {
  await mailer.sendMail({
    from: `"Cinema Tickets" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
}
