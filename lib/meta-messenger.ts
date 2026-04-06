
import fs from 'fs';
import path from 'path';

interface MetaConfig {
  page_access_token: string;
  page_id: string;
}

function getMetaConfig(): MetaConfig | null {
  try {
    if (!process.env.HOME) {
      console.warn('Variable HOME no está definida, no se pueden cargar secretos de Meta');
      return null;
    }
    
    const secretsPath = path.join(process.env.HOME, '.config', 'abacusai_auth_secrets.json');
    
    if (!fs.existsSync(secretsPath)) {
      console.warn('No se encontró el archivo de secretos para Meta (Facebook/Instagram)');
      return null;
    }

    const secretsData = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
    
    if (!secretsData.meta?.secrets?.page_access_token?.value ||
        !secretsData.meta?.secrets?.page_id?.value) {
      console.warn('Credenciales de Meta no configuradas');
      return null;
    }

    return {
      page_access_token: secretsData.meta.secrets.page_access_token.value,
      page_id: secretsData.meta.secrets.page_id.value,
    };
  } catch (error) {
    console.error('Error al cargar configuración de Meta:', error);
    return null;
  }
}

// Facebook Messenger
export async function sendFacebookMessage(recipientId: string, message: string): Promise<boolean> {
  try {
    const config = getMetaConfig();
    
    if (!config) {
      throw new Error('Meta (Facebook) no está configurado. Configure su Page Access Token en las API secrets.');
    }

    const response = await fetch(`https://graph.facebook.com/v18.0/me/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.page_access_token}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
        messaging_type: 'RESPONSE',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Error al enviar mensaje de Facebook: ${errorData.error?.message || 'Error desconocido'}`);
    }

    return true;
  } catch (error) {
    console.error('Error al enviar mensaje de Facebook:', error);
    throw error;
  }
}

// Instagram Direct Messages
export async function sendInstagramMessage(recipientId: string, message: string): Promise<boolean> {
  try {
    const config = getMetaConfig();
    
    if (!config) {
      throw new Error('Meta (Instagram) no está configurado. Configure su Page Access Token en las API secrets.');
    }

    const response = await fetch(`https://graph.facebook.com/v18.0/me/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.page_access_token}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Error al enviar mensaje de Instagram: ${errorData.error?.message || 'Error desconocido'}`);
    }

    return true;
  } catch (error) {
    console.error('Error al enviar mensaje de Instagram:', error);
    throw error;
  }
}

export function isMetaConfigured(): boolean {
  const config = getMetaConfig();
  return config !== null;
}
