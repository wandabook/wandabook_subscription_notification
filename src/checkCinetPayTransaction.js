import axios from 'axios';

/**
 * Vérifie le statut d'une transaction CinetPay
 * @param {string} transactionId - L'identifiant de la transaction à vérifier
 * @param {string} apikey - Votre clé API CinetPay
 * @param {string} siteId - Votre identifiant de site CinetPay
 * @returns {Promise<object>} - Résultat de la vérification
 */
export async function checkCinetPayTransaction(transactionId, apikey, siteId) {
    const url = "https://api-checkout.cinetpay.com/v2/payment/check";

    const payload = {
        apikey,
        site_id: siteId,
        transaction_id: transactionId,
    };

    try {
        const response = await axios.post(url, payload, {
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 10000,
        });

        const { data } = response;

        if (data.code === '00') {
            // SUCCESS
            return {
                success: true,
                status: data.data.status, // e.g., ACCEPTED, REFUSED
                paymentInfo: data.data
            };
        } else {
            // Une erreur de CinetPay (ex: transaction non trouvée)
            return {
                success: false,
                code: data.code,
                message: data.message || "Erreur inconnue de CinetPay"
            };
        }
    } catch (error) {
        console.error("Erreur lors de l'appel à CinetPay:", error.message);
        return {
            success: false,
            message: "Erreur réseau ou serveur",
            error: error.message
        };
    }
}

export async function sendEmail({ to, subject, text }) {
  try {
    const response = await axios.post(process.env.SEND_EMAIL_ROUTE, {
      to,
      subject,
      text
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.error || 'Failed to send email');
    }
    throw error;
  }
}