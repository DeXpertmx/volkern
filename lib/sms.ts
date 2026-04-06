
import fs from 'fs';
import path from 'path';

interface TwilioConfig {
  account_sid: string;
  auth_token: string;
  phone_number: string;
}

function getTwilioConfig(): TwilioConfig | null {
  try {
    if (!process.env.HOME) {
      console.warn('Variable HOME no está definida, no se pueden cargar secretos de Twilio');
      return null;
    }
    
    const secretsPath = path.join(process.env.HOME, '.config', 'abacusai_auth_secrets.json');
    
    if (!fs.existsSync(secretsPath)) {
      console.warn('No se encontró el archivo de secretos para SMS/Twilio');
      return null;
    }

    const secretsData = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
    
    if (!secretsData.twilio?.secrets?.account_sid?.value ||
        !secretsData.twilio?.secrets?.auth_token?.value ||
        !secretsData.twilio?.secrets?.phone_number?.value) {
      console.warn('Credenciales de Twilio no configuradas');
      return null;
    }

    return {
      account_sid: secretsData.twilio.secrets.account_sid.value,
      auth_token: secretsData.twilio.secrets.auth_token.value,
      phone_number: secretsData.twilio.secrets.phone_number.value,
    };
  } catch (error) {
    console.error('Error al cargar configuración de Twilio:', error);
    return null;
  }
}

export async function sendSMS(to: string, message: string): Promise<boolean> {
  try {
    const config = getTwilioConfig();
    
    if (!config) {
      throw new Error('Twilio no está configurado. Configure sus credenciales en las API secrets.');
    }

    // Asegurar que el número tenga el formato correcto (+país)
    const formattedTo = to.startsWith('+') ? to : `+${to}`;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${config.account_sid}:${config.auth_token}`).toString('base64'),
        },
        body: new URLSearchParams({
          To: formattedTo,
          From: config.phone_number,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Error al enviar SMS: ${errorData.message || 'Error desconocido'}`);
    }

    return true;
  } catch (error) {
    console.error('Error al enviar SMS:', error);
    throw error;
  }
}

export function isTwilioConfigured(): boolean {
  const config = getTwilioConfig();
  return config !== null;
}
