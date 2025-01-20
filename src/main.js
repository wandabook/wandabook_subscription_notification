import { Client, Databases, ID, Users } from 'node-appwrite';
import axios from 'axios';

// This Appwrite function will be executed every time your function is triggered
export default async ({ req, res, log, error }) => {
  // You can use the Appwrite SDK to interact with other services
  // For this example, we're using the Users service
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] ?? '');
  const database = new Databases(client);
  const users = new Users(client);
  async function notifyExpiringSubscriptions() {
    const databaseId = process.env.APPWRITE_DATABASE_ID; // Remplacez par l'ID de votre base de données
    const collectionId = process.env.APPWRITE_COLLECTION_PATRON; // Remplacez par l'ID de votre collection

    try {
      // Calcul de la date cible (aujourd'hui + 4 jours)
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 4);
      const targetDateISO = targetDate.toISOString();

      // Récupération des utilisateurs dont l'abonnement expire dans 4 jours
      const response = await database.listDocuments(databaseId, collectionId, [
        //Query.equal("endSubscriptionDate", targetDateISO),
      ]);

      const users = response.documents;

      if (users.length === 0) {
        log("Aucun utilisateur avec une fin d'abonnement dans 4 jours.");
        return;
      }

      // Envoi de messages
      for (const user of users) {
        const message = `Bonjour ${user.first_name}, votre abonnement expire le ${user.endSubscriptionDate}. Pensez à le renouveler pour éviter l'interruption des services.`;

        // Exemple avec une API WhatsApp/SMS (Twilio, WhatsApp API)
        await sendWhatsAppMessage(user.phone, user.first_name, user.endSubscriptionDate);

        log(`Message envoyé à ${user.first_name} (${user.phone}).`);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des utilisateurs ou de l'envoi :", error);
    }
  }


  async function sendWhatsAppMessage(phoneNumber, first_name, expiredDate) {
    const API_URL = "https://graph.facebook.com/v21.0/204442369428820/messages"; // Remplacez [YOUR_PHONE_NUMBER_ID] par l'ID de votre numéro
    const ACCESS_TOKEN = "EAAYEu6JFiHEBO4Dio7jLmZAtTqdFs8By6SEnVUyJZCZA8Wa3jdZAYWiYpGCR9BBzpsczaoez6urb6gfu36yZBD0lTuWIEAcSRCjdXp3U4oaZCe9JeZAU1ao4aSvQe26g2fETo9q1iMuugQQ9qP22rbLEuhAZCh7ZAgDwu0PdTw7ZCHWzJnVbxoQmZC0Dbm4dYEPC2L3pWfZAuOZCwmQDrsRiN3ZA7ZAm7xfQZBAZD"; // Votre token d'accès permanent

    try {
      // Corps de la requête pour envoyer un message texte
      const payload = {
        messaging_product: "whatsapp",
        to: '237659591504',
        type: "template",
        "template": {
          "name": "auto_pay_reminder_3",
          "language": {
            "code": "en_US"
          },
          "components": [
            {
              "type": "body",
              "parameters": [
                {
                  "type": "text",
                  "text": first_name
                },
                {
                  "type": "text",
                  "text": `${expiredDate}`
                }
              ]
            }
          ]
        }
      };

      // Envoi de la requête POST
      const response = await axios.post(API_URL, payload, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      });
      log(`Message envoyé avec succès à ${phoneNumber}:`, JSON.stringify(payload));
      console.log(`Message envoyé avec succès à ${phoneNumber}:`, JSON.stringify(response.data));
      log(`Message envoyé avec succès à ${phoneNumber}:`, JSON.stringify(response.status));
      log(`Message envoyé avec succès à ${phoneNumber}:`, JSON.stringify(response.statusText));
      log(`Message envoyé avec succès à ${phoneNumber}:`, JSON.stringify(response.config));

      return response.data;
    } catch (error) {
      console.error(`Erreur lors de l'envoi du message à ${phoneNumber}:`, error.response?.data || error.message);
    }
  }
  try {
    await notifyExpiringSubscriptions();
    log(`Total users: done`);
  } catch (err) {
    error("Could not list users: " + err.message);
  }

  // The req object contains the request data
  if (req.path === "/users") {
    const us = await users.list();
    return res.json(us);
  }
  if (req.method === "POST") {
    if (req.path === "/users") {
      const { email, name } = req.bodyJson;
      return (await users.create(ID.unique(), email, null, null, name));
    }
  }
  if (req.path === "/users") {
    const us = await users.list();
    return res.json(us);
  }

  return res.json({
    motto: "Build like a team of hundreds_",
    learn: "https://appwrite.io/docs",
    connect: "https://appwrite.io/discord",
    getInspired: "https://builtwith.appwrite.io",
  });
};
