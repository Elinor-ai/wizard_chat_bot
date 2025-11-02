import { Router } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";
import { wrapAsync, httpError } from "@wizard/utils";

const payloadSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Valid email required").max(200),
  message: z.string().min(1, "Message cannot be empty").max(4000),
  metadata: z.record(z.string(), z.unknown()).optional()
});

function createTransporter(logger) {
  const {
    SMTP_URL,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_SECURE,
    CONTACT_RECIPIENT_EMAIL,
    CONTACT_FROM_EMAIL
  } = process.env;

  const recipient = CONTACT_RECIPIENT_EMAIL ?? "noy.amsalem@botson.ai";
  if (!recipient) {
    return null;
  }

  let transporterConfig;
  if (SMTP_URL) {
    transporterConfig = SMTP_URL;
  } else {
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
      return null;
    }
    transporterConfig = {
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: SMTP_SECURE === "true",
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD
      }
    };
  }

  const transporter = nodemailer.createTransport(transporterConfig);

  async function verify() {
    try {
      await transporter.verify();
      logger.info("SMTP transporter verified");
    } catch (error) {
      logger.error({ error }, "SMTP verification failed");
      throw httpError(503, "Contact service unavailable");
    }
  }

  return {
    transporter,
    recipient,
    from: CONTACT_FROM_EMAIL ?? SMTP_USER ?? recipient,
    verify
  };
}

export function contactRouter({ logger }) {
  const router = Router();

  const transportWrapper = (() => {
    const wrapper = createTransporter(logger);
    if (wrapper) {
      wrapper.verify().catch((error) => {
        logger.warn({ error }, "SMTP verification check failed");
      });
    }
    return wrapper;
  })();

  router.post(
    "/",
    wrapAsync(async (req, res) => {
      if (!transportWrapper) {
        throw httpError(503, "Contact service unavailable");
      }

      const payload = payloadSchema.parse(req.body ?? {});

      const submittedAt = new Date();
      const plainText = [
        `Name: ${payload.name}`,
        `Email: ${payload.email}`,
        `Submitted: ${submittedAt.toISOString()}`,
        "",
        payload.message,
        "",
        payload.metadata
          ? `Metadata: ${JSON.stringify(payload.metadata, null, 2)}`
          : null
      ]
        .filter(Boolean)
        .join("\n");

      const htmlBody = `<p><strong>Name:</strong> ${payload.name}</p>
<p><strong>Email:</strong> ${payload.email}</p>
<p><strong>Submitted:</strong> ${submittedAt.toISOString()}</p>
<p><strong>Message:</strong></p>
<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(payload.message)}</pre>
${
  payload.metadata
    ? `<p><strong>Metadata:</strong></p><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(
        JSON.stringify(payload.metadata, null, 2)
      )}</pre>`
    : ""
}`;

      try {
        await transportWrapper.transporter.sendMail({
          from: transportWrapper.from,
          to: transportWrapper.recipient,
          subject: `[Wizard Contact] ${payload.name}`,
          replyTo: payload.email,
          text: plainText,
          html: htmlBody
        });
        logger.info({ email: payload.email }, "Contact form submitted");
      } catch (error) {
        logger.error({ error }, "Failed to send contact email");
        throw httpError(502, "Failed to send contact email");
      }

      res.json({ status: "received" });
    })
  );

  return router;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
