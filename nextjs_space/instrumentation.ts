export async function register() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://_:_@localhost/_'
  }
}
