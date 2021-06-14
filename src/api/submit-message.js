import axios from 'axios';
import nodemailer from 'nodemailer';

const notifyViaTelegramBot = async ({
  email,
  googleCaptchaScore,
  markedSpam,
  message: userMessage,
  name,
}) => {
  const data = JSON.stringify(
    { email, googleCaptchaScore, markedSpam, userMessage, name },
    null,
    2,
  );
  const text = `Contact Form Message: ${data}`;
  const result = (async () => {
    try {
      await axios({
        url: `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_API_TOKEN}/sendMessage`,
        method: 'POST',
        data: {
          chat_id: process.env.TELEGRAM_BOT_CHAT_ID,
          text,
        },
      });
      return { successful: true, message: '' };
    } catch (error) {
      let message;
      if (error.response) {
        message = `Telegram server responded with non 2xx code: ${error.response.data}`;
      } else if (error.request) {
        message = `No Telegram response received: ${error.request}`;
      } else {
        message = `Error setting up telegram response: ${error.message}`;
      }
      return { successful: false, message };
    }
  })();
  return result;
};

const recaptchaValidation = async ({ recaptchaToken }) => {
  const result = await (async () => {
    try {
      const response = await axios({
        url: 'https://www.google.com/recaptcha/api/siteverify',
        method: 'POST',
        params: { secret: process.env.RECAPTCHA_V3_SECRET_KEY, response: recaptchaToken },
      });
      return { successful: true, message: response.data.score };
    } catch (error) {
      let message;
      if (error.response) {
        message = `reCAPTCHA server responded with non 2xx code: ${error.response.data}`;
      } else if (error.request) {
        message = `No reCAPTCHA response received: ${error.request}`;
      } else {
        message = `Error setting up reCAPTCHA response: ${error.message}`;
      }
      return { successful: false, message };
    }
  })();
  return result;
};

const sendEmail = async ({ email, googleCaptchaScore, markedSpam, message, name }) => {
  const result = await (async () => {
    try {
      const text = JSON.stringify(
        {
          name,
          email,
          message,
          googleCaptchaScore,
          markedSpam,
        },
        null,
        2,
      );

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: 465,
        secure: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_SECRET,
        },
      });

      // uncomment for additional help debugging
      // await transporter.verify();

      const info = await transporter.sendMail({
        from: process.env.SMTP_SENDER,
        to: process.env.CONTACT_EMAIL,
        subject: 'example.com Contact Form Message',
        text,
      });
      return { successful: true, message: info.messageId };
    } catch (error) {
      return { successful: false, message: JSON.stringify(error, null, 2) };
    }
  })();
  return result;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
  } else {
    const { botField, email, message, name, recaptchaToken } = req.body;
    const markedSpam = botField != null;

    const recaptchaValidationResult = await recaptchaValidation({ recaptchaToken });

    if (!recaptchaValidationResult.successful) {
      res.status(400).send(recaptchaValidationResult.message);
    } else {
      const googleCaptchaScore = recaptchaValidationResult.message;

      const sendEmailPromise = sendEmail({
        email,
        googleCaptchaScore,
        markedSpam,
        message,
        name,
      });

      const notifyViaTelegramBotPromise = notifyViaTelegramBot({
        email,
        googleCaptchaScore,
        markedSpam,
        message,
        name,
      });
      const [sendEmailResult, notifyViaTelegramBotResult] = await Promise.all([
        sendEmailPromise,
        notifyViaTelegramBotPromise,
      ]);

      if (!sendEmailResult.successful) {
        res.status(400).send(sendEmailResult.message);
      } else if (!notifyViaTelegramBotResult.successful) {
        res.status(400).send(notifyViaTelegramBotResult.message);
      } else {
        res.status(200).send('All good!');
      }
    }
  }
}
