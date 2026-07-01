"""Bilingual (FR/EN) messages for API responses."""

MESSAGES = {
    "en": {
        "graph_not_ready": "The transaction graph has not been generated yet.",
        "model_not_trained": "The model has not been trained yet. Call /api/train.",
        "training_started": "Training completed successfully.",
        "graph_generated": "Transaction graph generated.",
        "account_not_found": "Account not found.",
        "ok": "OK",
    },
    "fr": {
        "graph_not_ready": "Le graphe transactionnel n'a pas encore été généré.",
        "model_not_trained": "Le modèle n'a pas encore été entraîné. Appelez /api/train.",
        "training_started": "Entraînement terminé avec succès.",
        "graph_generated": "Graphe transactionnel généré.",
        "account_not_found": "Compte introuvable.",
        "ok": "OK",
    },
}


def t(key: str, lang: str = "en") -> str:
    lang = lang if lang in MESSAGES else "en"
    return MESSAGES[lang].get(key, MESSAGES["en"].get(key, key))
