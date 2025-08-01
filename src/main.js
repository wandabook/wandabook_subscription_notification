import {
  Client,
  Databases,
  ID,
  Users,
  Functions,
  Query,
  ExecutionMethod,
} from 'node-appwrite';
import axios from 'axios';
import {
  checkCinetPayTransaction,
  generateWelcomeMessage,
  sendEmail,
} from './checkCinetPayTransaction.js';

// This Appwrite function will be executed every time your function is triggered
export default async ({ req, res, log, error }) => {
  // You can use the Appwrite SDK to interact with other services
  // For this example, we're using the Users service
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const apikey = process.env.APPWRITE_CINETPAY_API_KEY; // Votre clé API CinetPay
  const siteId = process.env.APPWRITE_CINETPAY_SITE_ID; // Votre identifiant de site CinetPay
  const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
  const COLLECTION_USER_ID = process.env.APPWRITE_COLLECTION_PATRON;
  const POST_FUNCTION_ID = process.env.APPWRITE_FUNCTION_POST_ID;

  const database = new Databases(client);
  const users = new Users(client);
  const functions = new Functions(client);

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
        Query.equal('endSubscriptionDate', targetDateISO),
        Query.limit(100), // Limite le nombre de résultats pour éviter les surcharges
      ]);

      const users = response.documents;

      if (users.length === 0) {
        log("Aucun utilisateur avec une fin d'abonnement dans 4 jours.");
        return;
      }

      // Envoi de messages
      for (const user of users) {
        const message = `Bonjour ${user.first_name}, votre abonnement expire le ${user.endSubscriptionDate}. Pensez à le renouveler pour éviter l'interruption des services.`;
        await sendEmail({
          to: user.email,
          subject: "Rappel d'expiration d'abonnement",
          text: message
        });

        log(`Message envoyé à ${user.first_name} (${user.phone}).`);
      }
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des utilisateurs ou de l'envoi :",
        error
      );
    }
  }

  async function getUserById(userId) {
    try {
      const user = await users.get(userId); // Get user data by ID
      return user;
    } catch (error) {
      return { error: 'Error fetching user:' + error };
    }
  }
  if (req.method === 'POST') {
    if (req.path === '/paymentnotification') {
      const { cpm_trans_id, cpm_site_id } = req.bodyJson;
      log(`Payment Notification Received:
        Transaction ID: ${cpm_trans_id}
        Site ID: ${cpm_site_id} `);
      const result = await checkCinetPayTransaction(
        cpm_trans_id,
        apikey,
        siteId
      );
      // To get the JSON back from metadata:

      const userDocs = await database.listDocuments(
        DATABASE_ID,
        COLLECTION_USER_ID,
        [Query.equal('cpm_trans_id', cpm_trans_id)]
      );
      log(`Payment Notification userDocs: ${JSON.stringify(userDocs)}`);
      if (userDocs.total === 1) {
        const user = userDocs.documents[0];
        const isDraft = user.status === 'Draft';
        const hasBarcode = user.barcode && user.barcode.trim() !== '';
        log(`Payment Notification Received: ${JSON.stringify(result)}`);

        if (result.success && result.status === 'ACCEPTED') {
          const metadataJson = JSON.parse(
            decodeURIComponent(escape(atob(result.paymentInfo.metadata)))
          );
          log('Decoded metadata JSON:', JSON.stringify(metadataJson));
          const metadata = metadataJson;
          if (!hasBarcode) {
            // Call the function to finalize user (e.g. generate barcode)
            const execution = await functions.createExecution(
              POST_FUNCTION_ID,
              JSON.stringify({
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                notification_email: user.email,
                password: user.password,
                phone: user.phone,
                address1: user.address1,
                city: user.city,
                cni: user.cni,
                patron_id: user.patron_id,
                tags: user.tags,
              }),
              false, // async (optional)
              'patron', // path (optional)
              ExecutionMethod.POST, // method (optional)
              {}
            );
            const output = execution.responseBody;
            log('output', JSON.stringify(output));
            try {
              const result = JSON.parse(output);
              const barcode = result.result.barcode;
              log(`User ${user.$id} Update`, JSON.stringify(output));
              if (barcode && barcode.trim() !== '') {
                // Mettre à jour le document utilisateur avec le nouveau barcode
                await database.updateDocument(
                  DATABASE_ID,
                  COLLECTION_USER_ID,
                  user.$id,
                  {
                    barcode: barcode,
                    password: '',
                    cpm_trans_id: "",
                    status: 'Active',
                  }
                );
              } else {
                log(
                  `User ${user.$id} Update`,
                  JSON.stringify({
                    updated: false,
                    reason: 'No barcode returned.',
                  })
                );
                return res.json({
                  updated: false,
                  reason: 'No barcode returned.',
                });
              }

              // send email to user
              const email = user.email;
              const subject = 'Wandabook Subscription Confirmation';
              const text = generateWelcomeMessage(user.first_name, barcode, process.env.APPWRITE_LOGIN_LINK);

              try {
                await sendEmail({ to: email, subject, text });
                log(`Email sent to ${email}`);
              } catch (emailError) {
                log(`Failed to send email to ${email}: ${emailError.message}`);
              }
              log(
                `User ${user.$id} Update`,
                JSON.stringify({ updated: true, barcode })
              );
              return res.json({ updated: true, barcode });
            } catch (error) {
              return res.json({
                updated: false,
                error: 'Invalid JSON output from post_function.',
              });
            }
          } else if (hasBarcode) {
            // Mettre à jour le document utilisateur avec le statut "Active"
            const isFreeze = user.isFreeze;
            if (isFreeze) {
              const execution = await functions.createExecution(
                POST_FUNCTION_ID,
                JSON.stringify({
                  freeze: false,
                  patron_id: user.patron_id,
                  tags: user.tags,
                }),
                false, // async (optional)
                'patron', // path (optional)
                ExecutionMethod.PUT, // method (optional)
                {}
              );
            }

            await database.updateDocument(
              DATABASE_ID,
              COLLECTION_USER_ID,
              user.$id,
              {
                status: 'Active',
                password: '',
                freeze: false,
                subscriptionPlan: metadata.subscriptionPlan,
                lastSubscriptionDate: metadata.lastSubscriptionDate,
                endSubscriptionDate: metadata.endSubscriptionDate,
                isAnnual: metadata.isAnnual,
                patron_id: metadata.patron_id,
                tags: metadata.tags,
                cpm_trans_id: ""
              }
            );
            log(`User ${user.$id} updated to Active with existing barcode`);
            // Envoyer un email de reactivation
            const subject = 'Wandabook Subscription Reactivation';
            const email = user.email;
            const text = `Bonjour ${user.first_name},\n\nVotre abonnement a été réactivé avec succès. Votre identifiant de patron est ${user.barcode}.\n\nMerci pour votre confiance !\n\nCordialement,\nL'équipe Wandabook`;
            try {
              await sendEmail({ to: email, subject, text });
              log(`Email sent to ${email}`);
            } catch (emailError) {
              log(`Failed to send email to ${email}: ${emailError.message}`);
            }
            return res.json({ updated: true, barcode: user.barcode });
          } else {
            log(`User ${user.$id} already active or has a barcode`);
            return res.json({
              updated: false,
              message: 'User already active or has a barcode',
            });
          }
        } else if (
          result.status === 'REFUSED' ||
          result.message == 'PAYMENT_FAILED'
        ) {
          if (!hasBarcode) {
            await database.deleteDocument(
              DATABASE_ID,
              COLLECTION_USER_ID,
              user.$id
            );
            log(`User ${user.$id} deleted (payment refused and no barcode)`);
          }
        }
      }

      return res.json({ success: false, message: 'Payment failled' });
    } else if (req.path === '/paymentcancel') {
    } else if (req.path === '/changePassword') {
      const { userId, password } = req.bodyJson;
      const resp = await users.updatePassword(userId, password)
      return res.json(resp);
    }

    if (req.path === '/users') {
      try {
        const { email, phone, name } = req.bodyJson;
        const userCreated = await users.create(
          ID.unique(),
          email,
          phone,
          'D21j12&$',
          name
        );
        return res.json(userCreated);
      } catch (err) {
        error('Could not list users: ' + err.message);
        return res.json(err);
      }
    } else {
      try {
        await notifyExpiringSubscriptions();
        log(`Total users: done`);
      } catch (err) {
        error('Could not list users: ' + err.message);
      }
    }
  } else if (req.path === '/users') {
    const us = await users.list();
    return res.json(us);
  } else if (req.path == '/getUserIds') {
    const { id } = req.bodyJson;
    const result = await getUserById(id);
    return res.json(result);
  } else if (req.path === '/patron') {
    return res.json({});
  }
  else {
    await notifyExpiringSubscriptions();
  }

  return res.json({
    motto: 'unknown services',
  });
};
