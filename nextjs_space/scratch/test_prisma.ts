import { globalPrisma } from '../lib/db'
async function test() {
  console.log('Models in prisma:', Object.keys(globalPrisma).filter(k => !k.startsWith('$')))
}
test()
