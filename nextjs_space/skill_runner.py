import os
import time
import yaml
import json
from openai import OpenAI
from typing import Dict, List, Any

# CONFIGURACIÓN
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY")  # O pon tu key aquí directo
MODEL = "qwen-plus" # o qwen-turbo / qwen-max
MAX_RETRIES = 3
BASE_DELAY = 2  # Segundos base de espera
SKILLS_DIR = "./skills"

class SmartAgent:
    def __init__(self):
        self.client = OpenAI(
            api_key=DASHSCOPE_API_KEY,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
        )
        self.skills: Dict[str, Any] = {}
        self.load_skills()
        print("✅ Agente Inteligente Cargado. Sistema Anti-RateLimit Activo.")

    def load_skills(self):
        """Carga todos los archivos YAML de la carpeta skills/"""
        if not os.path.exists(SKILLS_DIR):
            print(f"⚠️ Carpeta {SKILLS_DIR} no encontrada. Crea una y añade tus YAMLs.")
            return

        for filename in os.listdir(SKILLS_DIR):
            if filename.endswith(".yaml"):
                filepath = os.path.join(SKILLS_DIR, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        skill_data = yaml.safe_load(f)
                        skill_id = skill_data.get('id', filename.replace('.yaml', ''))
                        self.skills[skill_id] = skill_data
                        print(f"📥 Skill cargado: {skill_id}")
                except Exception as e:
                    print(f"❌ Error cargando {filename}: {e}")

    def safe_request(self, messages: List[Dict], skill_config: Dict = None) -> str:
        """Envía la petición con control de velocidad y reintentos"""
        attempts = 0
        
        while attempts < MAX_RETRIES:
            try:
                # 1. DELAY ESTRATÉGICO (Para evitar "Request rate increased too quickly")
                # Si es una petición rápida, espera un poco para no saturar
                time.sleep(BASE_DELAY) 
                
                print(f"🚀 Enviando a {MODEL}... (Intento {attempts + 1})")
                
                response = self.client.chat.completions.create(
                    model=MODEL,
                    messages=messages,
                    temperature=skill_config.get('temperature', 0.2) if skill_config else 0.3,
                    max_tokens=skill_config.get('max_tokens', 4000) if skill_config else 4000
                )
                
                return response.choices[0].message.content

            except Exception as e:
                error_msg = str(e)
                
                # 2. DETECCIÓN ESPECÍFICA DEL ERROR DE ALIBABA
                if "Request rate increased too quickly" in error_msg or "429" in error_msg:
                    wait_time = (BASE_DELAY * 2) * (attempts + 1) # Backoff exponencial
                    print(f"⚠️ RATE LIMIT DETECTADO. Esperando {wait_time}s para estabilizar...")
                    time.sleep(wait_time)
                    attempts += 1
                else:
                    print(f"❌ Error no recuperable: {e}")
                    return f"Error: {e}"
        
        return "❌ Fallo tras múltiples intentos debido a límites de tasa."

    def run(self, skill_id: str, user_prompt: str):
        """Ejecuta una tarea con un skill específico"""
        if skill_id not in self.skills:
            print(f"❌ Skill '{skill_id}' no encontrado.")
            return

        skill = self.skills[skill_id]
        print(f"\n🤖 Activando Skill: {skill.get('name')}")
        
        # Construir el mensaje del sistema
        system_msg = skill.get('system_prompt', "Eres un asistente útil.")
        
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_prompt}
        ]

        # Enviar y recibir
        response = self.safe_request(messages, skill_config=skill)
        print(f"\n👇 RESPUESTA DE {skill.get('name').upper()}:")
        print("-" * 40)
        print(response)
        print("-" * 40)

# --- MODO DE USO ---
if __name__ == "__main__":
    agent = SmartAgent()
    
    # Ejemplo de uso:
    # python skill_runner.py
    agent.run("senior_architect", "Diseña una arquitectura para un sistema de reservas de citas médico escalable en la nube.")