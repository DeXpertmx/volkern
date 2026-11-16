-- Token de agente (usuario) de Chatwoot, separado del token del bot que ya
-- guarda hubApiToken. Chatwoot rechaza los envíos del bot con 401, así que sin
-- este token los mensajes salientes caían siempre a Evolution.
ALTER TABLE "messaging_hub_config" ADD COLUMN "chatwootAgentToken" TEXT;
