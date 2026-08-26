#!/usr/bin/env python3
"""Busca fotos de perfil públicas do Instagram dos clientes da Viral Mind Labs.

Uso: python3 scripts/fetch-client-photos.py

Leitura anônima da página pública de cada perfil (sem login, sem API oficial)
-- fora dos Termos de Uso do Instagram, risco assumido conscientemente pro
uso: fotos dos próprios clientes da consultoria, sem escala. Falha por
handle é esperada (bloqueio/rate-limit) e não interrompe o script; os que
falharem ficam para preenchimento manual.

Roda local, fora do site publicado (não sobe pro public_html).
"""
import json
import re
import time
import random
import urllib.request
import urllib.error
from pathlib import Path

CLIENTS = [
    ("cliente-1", "marcelogermanoeag"),
    ("cliente-2", "cafecomferri"),
    ("cliente-3", "izabela.anholett"),
    ("cliente-4", "felipedantasf"),
    ("cliente-5", "lincolnfracari"),
    ("cliente-6", "caduneiva"),
    ("cliente-7", "granvas"),
    ("cliente-8", "thiagofranco"),
    ("cliente-9", "marcospelozato.oficial"),
    ("cliente-10", "dilsonperesjr"),
    ("cliente-11", "orenatotorres"),
    ("cliente-12", "leonardocirino"),
    ("cliente-13", "leonardorn"),
    ("cliente-14", "fernandopereira.finance"),
    ("cliente-15", "rafaelrodriguesluiz"),
]

OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "img" / "clientes"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
# App ID público usado pelo próprio site do Instagram nas chamadas do navegador
# pro endpoint interno web_profile_info -- não é chave secreta, é fixo/conhecido.
IG_APP_ID = "936619743392459"


def fetch(url, extra_headers=None):
    headers = {"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"}
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()


def find_pic_url(handle):
    url = f"https://i.instagram.com/api/v1/users/web_profile_info/?username={handle}"
    data = fetch(url, {"X-IG-App-ID": IG_APP_ID, "Accept": "*/*"})
    payload = json.loads(data)
    pic = payload.get("data", {}).get("user", {}).get("profile_pic_url_hd")
    return pic


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ok, failed = [], []
    for slot_id, handle in CLIENTS:
        try:
            pic_url = find_pic_url(handle)
            if not pic_url:
                raise ValueError("perfil sem foto de perfil ou conta não encontrada")
            data = fetch(pic_url)
            dest = OUT_DIR / f"{slot_id}.jpg"
            dest.write_bytes(data)
            print(f"OK       {slot_id} (@{handle}) -> {dest}")
            ok.append(slot_id)
        except Exception as e:
            print(f"FALHOU   {slot_id} (@{handle}): {e}")
            failed.append(slot_id)
        time.sleep(random.uniform(3, 6))

    print(f"\n{len(ok)}/{len(CLIENTS)} fotos baixadas.")
    if failed:
        print(f"Falharam (preencher manualmente): {', '.join(failed)}")


if __name__ == "__main__":
    main()
