import nodemailer from "nodemailer";
import { env } from "../../config/env";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  private isConfigured(): boolean {
    return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 587),
        secure: env.SMTP_SECURE === "true",
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }
    return this.transporter;
  }

  async sendEmail(input: SendEmailInput): Promise<void> {
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    const validRecipients = recipients.map((r) => r.trim()).filter(Boolean);
    if (!validRecipients.length) {
      throw new Error("Nenhum destinatário de e-mail informado");
    }

    if (!this.isConfigured()) {
      if (env.NODE_ENV === "development") {
        console.warn(
          "[email] SMTP não configurado. Mensagem não enviada:",
          input.subject,
          "→",
          validRecipients.join(", "),
        );
        console.warn("[email] Conteúdo:\n", input.text);
        return;
      }
      throw new Error(
        "Servidor de e-mail não configurado. Configure SMTP_HOST, SMTP_USER e SMTP_PASS.",
      );
    }

    await this.getTransporter().sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: validRecipients.join(", "),
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }
}

export const emailService = new EmailService();
