#!/usr/bin/env python3
"""
auditor_core.py — Volkern AI Ethics & Compliance Auditor
=========================================================
Script sidecar de auditoría de equidad algorítmica.

Analiza los AttendanceChallenge del ERP Volkern para detectar
sesgo demográfico en las pruebas aleatorias de presencia.

Métricas:
  - Coeficiente de Variación (CV) por grupo demográfico
  - Umbral AMARILLO: CV > 0.05 → Alerta y notificación
  - Umbral ROJO:     CV > 0.10 → Kill Switch + alerta crítica

Ejecutar manualmente:
  python auditor_core.py

O configurar como cron job (Docker Compose):
  0 */4 * * * python /app/auditor_core.py >> /var/log/auditor.log 2>&1
"""

import os
import hashlib
import json
import requests
import psycopg2
from datetime import datetime, timezone
from dotenv import load_dotenv

# ─── Configuración ─────────────────────────────────────────────────────────────

load_dotenv()

DB_CONFIG = {
    "dbname":   os.getenv("DB_NAME",     "volkern_local"),
    "user":     os.getenv("DB_USER",     "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
    "host":     os.getenv("DB_HOST",     "localhost"),
    "port":     os.getenv("DB_PORT",     "5432"),
}

TELEGRAM_TOKEN   = os.getenv("TELEGRAM_TOKEN",   "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# Umbrales de Coeficiente de Variación
CV_THRESHOLD_YELLOW = float(os.getenv("CV_THRESHOLD_YELLOW", "0.05"))
CV_THRESHOLD_RED    = float(os.getenv("CV_THRESHOLD_RED",    "0.10"))

# ─── Notificaciones ────────────────────────────────────────────────────────────

def send_telegram(level: str, message: str) -> None:
    """Envía alerta a Telegram si está configurado."""
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        print(f"[AUDITOR] Telegram no configurado. Alerta [{level}]: {message[:80]}")
        return

    emojis = {"AMARILLO": "⚠️", "ROJO": "🚨", "INFO": "ℹ️"}
    emoji = emojis.get(level, "🔔")

    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": (
            f"{emoji} *VOLKERN AI AUDIT [{level}]*\n\n"
            f"{message}\n\n"
            f"🔗 Backoffice: {os.getenv('BACKOFFICE_URL', 'http://localhost:3000')}/admin/auditoria"
        ),
        "parse_mode": "Markdown",
    }
    try:
        r = requests.post(url, json=payload, timeout=10)
        r.raise_for_status()
        print(f"[AUDITOR] Telegram enviado: [{level}]")
    except Exception as e:
        print(f"[AUDITOR] Error enviando Telegram: {e}")


# ─── Lógica Principal ──────────────────────────────────────────────────────────

def compute_bias(conn) -> dict:
    """
    Calcula el Coeficiente de Variación (CV) de la distribución de
    pruebas de presencia por grupo demográfico.

    Usa `demographic_group` si está disponible, con fallback a `department`.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                COALESCE(e.demographic_group, e.department, 'SIN_GRUPO') AS grp,
                COUNT(ac.id) AS challenge_count
            FROM erp_attendance_challenges ac
            JOIN erp_attendance_logs al ON ac.attendance_id = al.id
            JOIN erp_employees e ON al.employee_id = e.id
            WHERE ac.timestamp >= NOW() - INTERVAL '30 days'
            GROUP BY grp
            ORDER BY challenge_count DESC
        """)
        rows = cur.fetchall()

    if not rows:
        return {
            "counts": {},
            "cv": 0.0,
            "mean": 0.0,
            "std": 0.0,
            "total": 0,
        }

    counts = {row[0]: int(row[1]) for row in rows}
    values = list(counts.values())
    n = len(values)
    total = sum(values)

    if n < 2:
        # Con un solo grupo no hay comparación posible
        return {"counts": counts, "cv": 0.0, "mean": values[0], "std": 0.0, "total": total}

    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / n
    std = variance ** 0.5
    cv = std / mean if mean > 0 else 0.0

    return {"counts": counts, "cv": cv, "mean": mean, "std": std, "total": total}


def get_last_hash(conn) -> str | None:
    """Obtiene el integrity_hash del último registro del audit_vault."""
    with conn.cursor() as cur:
        cur.execute("SELECT integrity_hash FROM audit_vault ORDER BY audit_date DESC LIMIT 1")
        row = cur.fetchone()
    return row[0] if row else None


def compute_integrity_hash(cv: float, status: str, timestamp: str, prev_hash: str | None) -> str:
    """Genera el sello SHA-256 encadenado con el registro anterior."""
    chain = f"{cv:.6f}|{status}|{timestamp}|{prev_hash or 'GENESIS'}"
    return hashlib.sha256(chain.encode("utf-8")).hexdigest()


def execute_kill_switch(conn) -> None:
    """Desactiva el módulo de pruebas aleatorias en ai_module_controls."""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO ai_module_controls (id, module_key, is_active, updated_by, reason, updated_at)
            VALUES (gen_random_uuid(), 'random_presence_tests', FALSE,
                    'auditor_system', 'Bloqueo automático por sesgo alto detectado', NOW())
            ON CONFLICT (module_key) DO UPDATE
            SET is_active   = FALSE,
                updated_by  = 'auditor_system',
                reason      = 'Bloqueo automático por sesgo alto detectado',
                updated_at  = NOW()
        """)
    conn.commit()
    print("[AUDITOR] 🔒 Kill Switch ejecutado: módulo DESACTIVADO")


def save_to_vault(conn, cv: float, status: str, group_counts: dict,
                  total: int, action: str, prev_hash: str | None,
                  integrity_hash: str) -> str:
    """Guarda el resultado de la auditoría en audit_vault."""
    summary = (
        f"Auditoría automática de {total} pruebas de presencia en los últimos 30 días. "
        f"Coeficiente de Variación (CV) = {cv:.4f} ({cv*100:.2f}%). "
        f"Estado: {status}. Grupos analizados: {len(group_counts)}."
    )

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO audit_vault
                (audit_date, bias_score, status, integrity_hash, prev_hash,
                 finding_summary, action_taken, total_records, group_breakdown)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            datetime.now(timezone.utc),
            cv,
            status,
            integrity_hash,
            prev_hash,
            summary,
            action,
            total,
            json.dumps(group_counts),
        ))
        record_id = cur.fetchone()[0]
    conn.commit()
    print(f"[AUDITOR] ✅ Registro guardado en audit_vault: ID={record_id}")
    return record_id


def save_system_alert(conn, level: str, message: str, audit_id: str) -> None:
    """Crea una alerta en system_alerts para el Backoffice."""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO system_alerts (id, level, message, audit_id, resolved, created_at)
            VALUES (gen_random_uuid(), %s, %s, %s, FALSE, NOW())
        """, (level, message, audit_id))
    conn.commit()


# ─── Entry Point ───────────────────────────────────────────────────────────────

def audit_and_protect() -> None:
    print(f"\n[AUDITOR] ══════════════════════════════════════════════")
    print(f"[AUDITOR] Volkern AI Ethics Auditor — {datetime.now().isoformat()}")
    print(f"[AUDITOR] ══════════════════════════════════════════════\n")

    conn = psycopg2.connect(**DB_CONFIG)

    try:
        # 1. Calcular sesgo demográfico
        bias = compute_bias(conn)
        cv = bias["cv"]
        group_counts = bias["counts"]
        total = bias["total"]

        print(f"[AUDITOR] Registros analizados: {total}")
        print(f"[AUDITOR] Grupos detectados: {group_counts}")
        print(f"[AUDITOR] Coef. Variación (CV): {cv:.4f} ({cv*100:.2f}%)")

        # 2. Determinar estado y acción
        status = "VERDE"
        action = "NINGUNA"

        if cv > CV_THRESHOLD_RED:
            status = "ROJO"
            action = "BLOQUEO_PREVENTIVO"
            print(f"[AUDITOR] 🚨 UMBRAL ROJO superado ({cv*100:.2f}% > {CV_THRESHOLD_RED*100:.0f}%)")

        elif cv > CV_THRESHOLD_YELLOW:
            status = "AMARILLO"
            action = "ALERTA_ENVIADA"
            print(f"[AUDITOR] ⚠️ Umbral AMARILLO superado ({cv*100:.2f}% > {CV_THRESHOLD_YELLOW*100:.0f}%)")

        else:
            print(f"[AUDITOR] ✅ Sistema en rango VERDE — Sin sesgo significativo")

        # 3. Hash encadenado (blockchain-like)
        prev_hash = get_last_hash(conn)
        now_iso = datetime.now(timezone.utc).isoformat()
        integrity_hash = compute_integrity_hash(cv, status, now_iso, prev_hash)
        print(f"[AUDITOR] Sello SHA-256: {integrity_hash[:32]}…")

        # 4. Guardar en audit_vault
        audit_id = save_to_vault(
            conn, cv, status, group_counts, total,
            action, prev_hash, integrity_hash
        )

        # 5. Ejecutar Kill Switch si es necesario (ROJO)
        if status == "ROJO":
            execute_kill_switch(conn)
            msg = (
                f"🚨 BLOQUEO PREVENTIVO ACTIVADO\n"
                f"Sesgo demográfico crítico: CV={cv*100:.2f}% (umbral: {CV_THRESHOLD_RED*100:.0f}%)\n"
                f"Distribución: {json.dumps(group_counts, ensure_ascii=False)}\n"
                f"Registro de auditoría: {audit_id}\n"
                f"El módulo de pruebas aleatorias ha sido DESACTIVADO automáticamente.\n"
                f"Se requiere revisión humana antes de reactivar."
            )
            save_system_alert(conn, "CRITICAL", msg, audit_id)
            send_telegram("ROJO", msg)

        elif status == "AMARILLO":
            msg = (
                f"Sesgo leve detectado: CV={cv*100:.2f}% (umbral: {CV_THRESHOLD_YELLOW*100:.0f}%)\n"
                f"Distribución: {json.dumps(group_counts, ensure_ascii=False)}\n"
                f"Registro de auditoría: {audit_id}\n"
                f"Revisar el dashboard de auditoría para más detalles."
            )
            save_system_alert(conn, "WARNING", msg, audit_id)
            send_telegram("AMARILLO", msg)

        print(f"\n[AUDITOR] ✅ Auditoría completada. Estado: {status}")

    except Exception as e:
        print(f"[AUDITOR] ❌ Error fatal: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    audit_and_protect()
