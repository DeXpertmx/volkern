
/**
 * Cliente API para la integración de Correos Empresariales
 * Soporta NameCrane (creación de dominios) y SmarterMail (gestión de cuentas)
 */

interface NameCraneConfig {
    apiKey: string
    diskLimit: number
    userLimit: number
}

interface SmarterMailConfig {
    apiUrl: string
    adminUser: string
    adminPass: string
}

export class EmailApiService {
    private ncConfig: NameCraneConfig
    private smConfig: SmarterMailConfig

    constructor() {
        this.ncConfig = {
            apiKey: process.env.NAMECRANE_API_KEY || '',
            diskLimit: 10, // Defecto 10GB
            userLimit: 10, // Defecto 10 cuentas (se ajustará por plan)
        }

        this.smConfig = {
            apiUrl: process.env.SMARTERMAIL_API_URL || 'https://eu1.workspace.org',
            adminUser: process.env.SMARTERMAIL_ADMIN_USER || '',
            adminPass: process.env.SMARTERMAIL_ADMIN_PASSWORD || '',
        }
    }

    /**
     * Registra un nuevo dominio en NameCrane (Solo para revendedores)
     */
    async createDomainInNameCrane(domain: string, diskLimit?: number, userLimit?: number) {
        if (!this.ncConfig.apiKey) {
            throw new Error('NAMECRANE_API_KEY no configurada')
        }

        const params = new URLSearchParams()
        params.append('domain', domain)
        params.append('disklimit', (diskLimit || this.ncConfig.diskLimit).toString())
        params.append('userlimit', (userLimit || this.ncConfig.userLimit).toString())
        params.append('useraliaslimit', '0')
        params.append('domainaliaslimit', '0')
        params.append('spamexperts', 'true')
        params.append('spamexperts_adminaccess', 'primary')
        params.append('archive_years', 'false')
        params.append('archive_direction', 'false')
        params.append('filestorage', 'true')
        params.append('office', 'true')

        const response = await fetch('https://namecrane.com/index.php?m=cranemail&action=api/domain/create', {
            method: 'POST',
            headers: {
                'X-API-KEY': this.ncConfig.apiKey,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        })

        const text = await response.text()

        if (!response.ok) {
            throw new Error(`Error en NameCrane: ${response.status} - ${text}`)
        }

        // NameCrane suele devolver JSON o texto plano dependiendo del resultado
        try {
            return JSON.parse(text)
        } catch {
            return { message: text }
        }
    }

    /**
     * Obtiene un token de acceso para SmarterMail
     */
    private async getSmarterMailToken() {
        if (!this.smConfig.adminUser || !this.smConfig.adminPass) {
            throw new Error('Credenciales de SmarterMail no configuradas')
        }

        const response = await fetch(`${this.smConfig.apiUrl}/api/v1/auth/authenticate-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: this.smConfig.adminUser,
                password: this.smConfig.adminPass,
            }),
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(`Error de autenticación SmarterMail: ${JSON.stringify(error)}`)
        }

        const data = await response.json()
        return data.accessToken
    }

    /**
     * Crea una cuenta de correo en SmarterMail
     */
    async createEmailAccount(params: {
        username: string
        fullName?: string
        password?: string
        maxSize?: number // En Bytes
    }) {
        const token = await this.getSmarterMailToken()

        // Si no se pasa maxSize, por defecto 100MB (104857600 bytes)
        const quota = params.maxSize || 104857600

        const response = await fetch(`${this.smConfig.apiUrl}/api/v1/settings/domain/user-put`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userData: {
                    userName: params.username,
                    fullName: params.fullName || params.username,
                    password: params.password || 'Volkern#2026', // Password robusto por defecto
                    securityFlags: {
                        authType: 0,
                        isDomainAdmin: false
                    },
                    userMailSettings: {
                        maxSize: quota
                    }
                }
            }),
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(`Error creando cuenta en SmarterMail: ${JSON.stringify(error)}`)
        }

        return await response.json()
    }

    /**
     * Elimina una cuenta de correo (Simulado basado en docs SmarterMail)
     * Nota: El endpoint exacto de delete puede variar, se asume basado en el patrón user-put
     */
    async deleteEmailAccount(username: string) {
        const token = await this.getSmarterMailToken()

        const response = await fetch(`${this.smConfig.apiUrl}/api/v1/settings/domain/user-delete`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username
            }),
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(`Error eliminando cuenta en SmarterMail: ${JSON.stringify(error)}`)
        }

        return await response.json()
    }
}

export const emailApi = new EmailApiService()
