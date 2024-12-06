import { Client, Databases, Users } from 'node-appwrite';
const axios = require("axios");

// This Appwrite function will be executed every time your function is triggered
export default async ({ req, res, log, error }) => {
  // You can use the Appwrite SDK to interact with other services
  // For this example, we're using the Users service
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] ?? '');
  const database = new Databases(client);

  async function notifyExpiringSubscriptions() {
    const databaseId = "[YOUR_DATABASE_ID]"; // Remplacez par l'ID de votre base de données
    const collectionId = "[YOUR_COLLECTION_ID]"; // Remplacez par l'ID de votre collection

    try {
      // Calcul de la date cible (aujourd'hui + 4 jours)
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 4);
      const targetDateISO = targetDate.toISOString();

      // Récupération des utilisateurs dont l'abonnement expire dans 4 jours
      const response = await database.listDocuments(databaseId, collectionId, [
        Query.equal("endSubscriptionDate", targetDateISO),
      ]);

      const users = response.documents;

      if (users.length === 0) {
        console.log("Aucun utilisateur avec une fin d'abonnement dans 4 jours.");
        return;
      }

      // Envoi de messages
      for (const user of users) {
        const message = `Bonjour ${user.rst_name}, votre abonnement expire le ${user.endSubscriptionDate}. Pensez à le renouveler pour éviter l'interruption des services.`;

        // Exemple avec une API WhatsApp/SMS (Twilio, WhatsApp API)
        await sendMessage(user.phone, message);

        console.log(`Message envoyé à ${user.rst_name} (${user.phone}).`);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des utilisateurs ou de l'envoi :", error);
    }
  }
  // Fonction d'envoi de message (via une API, ex. Twilio ou autre)
  async function sendMessage(phoneNumber, message) {
    const apiUrl = "https://api.twilio.com/[YOUR_ENDPOINT]"; // Remplacez par votre endpoint API
    const apiToken = "[YOUR_API_TOKEN]"; // Clé d'accès API

    try {
      const response = await axios.post(apiUrl, {
        to: phoneNumber,
        body: message,
      }, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      });

      console.log(`Message envoyé avec succès : ${response.data}`);
    } catch (error) {
      console.error(`Erreur lors de l'envoi du message à ${phoneNumber}:`, error);
    }
  }

  async function sendWhatsAppMessage(phoneNumber, messageText) {
    const API_URL = "https://graph.facebook.com/v17.0/[YOUR_PHONE_NUMBER_ID]/messages"; // Remplacez [YOUR_PHONE_NUMBER_ID] par l'ID de votre numéro
    const ACCESS_TOKEN = "[YOUR_ACCESS_TOKEN]"; // Votre token d'accès permanent

    try {
      // Corps de la requête pour envoyer un message texte
      const payload = {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "text",
        text: {
          body: messageText,
        },
      };

      // Envoi de la requête POST
      const response = await axios.post(API_URL, payload, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      });

      console.log(`Message envoyé avec succès à ${phoneNumber}:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de l'envoi du message à ${phoneNumber}:`, error.response?.data || error.message);
    }
  }
  try {
    notifyExpiringSubscriptions();
    log(`Total users: ${response.total}`);
  } catch (err) {
    error("Could not list users: " + err.message);
  }

  // The req object contains the request data
  if (req.path === "/ping") {
    // Use res object to respond with text(), json(), or binary()
    // Don't forget to return a response!
    return res.text("Pong");
  }

  return res.json({
    motto: "Build like a team of hundreds_",
    learn: "https://appwrite.io/docs",
    connect: "https://appwrite.io/discord",
    getInspired: "https://builtwith.appwrite.io",
  });
};
