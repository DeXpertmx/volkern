const botToken = "8603679260:AAG6TiEsBjEVAmL_YCwomtMsNXL2K6JRuRk";

async function getBotUpdates() {
  console.log('--- Checking for Telegram Bot Updates ---');
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
    const data = await response.json();
    
    if (data.ok) {
      if (data.result.length === 0) {
        console.log('No recent updates found. Please send a message to the bot first.');
      } else {
        console.log('Recent Updates:');
        data.result.slice(-5).forEach(update => {
          const chat = update.message?.chat || update.channel_post?.chat;
          if (chat) {
            console.log(`Chat ID: ${chat.id} (${chat.title || chat.username || chat.first_name})`);
            console.log(`Text: ${update.message?.text || update.channel_post?.text}`);
            console.log('------------------');
          }
        });
      }
    } else {
      console.error('Error fetching updates:', data.description);
    }
  } catch (error) {
    console.error('Fetch error:', error.message);
  }
}

getBotUpdates();
