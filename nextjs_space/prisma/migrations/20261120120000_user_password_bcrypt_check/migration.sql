-- La contraseña se guarda como bcrypt de 60 caracteres, o NULL si la cuenta no
-- tiene acceso (p. ej. el bot de finanzas).
--
-- Cualquier otro valor no se puede validar nunca: `bcrypt.compare` devuelve
-- false y la cuenta queda inaccesible sin más pista que «contraseña inválida».
-- El 19-nov-2026 apareció en `User.password` un valor de 89 caracteres con
-- prefijo `$2b$` que ningún escritor de la app produce (todos hashean con
-- bcrypt): la cuenta dejó de poder entrar y solo se detectó al intentarlo.
--
-- Esta restricción cierra ese hueco para CUALQUIER escritor —la app, un script
-- o un UPDATE a mano por psql— y no depende de que cada uno se acuerde de
-- hashear. Si algún día se cambia el algoritmo, hay que sustituir el patrón en
-- la misma migración que migre los hashes, no relajarlo a mano en producción.
ALTER TABLE "User" ADD CONSTRAINT "User_password_bcrypt_check"
  CHECK (password IS NULL OR password ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$');
