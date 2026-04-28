import nodemailer from "nodemailer";

const buildTransport = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
};

export const sendOrderConfirmation = async (order) => {
  const transport = buildTransport();
  const to = order.shippingAddress?.email;

  if (!to) return;

  if (!transport) {
    console.log(`Order confirmation skipped (no SMTP). Order ${order.orderNumber} for ${to}`);
    return;
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM || "orders@yourguyinjapan.com",
    to,
    subject: `YourGuyInJapan order ${order.orderNumber}`,
    text: `Thank you for your purchase. Your order is currently ${order.orderStatus}.`
  });
};

