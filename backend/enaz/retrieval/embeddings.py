"""Embedding providers.

`HashingEmbedder` needs no network or model download: it hashes words, word
bigrams and character trigrams into a fixed-size signed vector. It captures
lexical and sub-word similarity (plurals, typos, compound terms) and is a solid
offline default; production deployments switch to a neural model (`voyage`) by
setting ENAZ_EMBEDDING_PROVIDER, then re-index.
"""

from __future__ import annotations

import hashlib
import re
from typing import Protocol

import httpx
import numpy as np

_WORD = re.compile(r"[a-z0-9]+(?:[-_][a-z0-9]+)*")
STOPWORDS = frozenset(
    "a an and are as at be but by for from has have how i if in into is it its of on or our so "
    "that the their them there these they this to was we were what when where which who why will "
    "with you your do does did can could should would about after all any also been before being "
    "between both each few more most other over same some such than then too very just not no".split()
)


def tokenize(text: str) -> list[str]:
    return [w for w in _WORD.findall(text.lower()) if w not in STOPWORDS]


def _stem(word: str) -> str:
    for suffix in ("ing", "edly", "ed", "ies", "es", "s", "ly"):
        if len(word) > len(suffix) + 3 and word.endswith(suffix):
            return word[: -len(suffix)] + ("y" if suffix == "ies" else "")
    return word


class Embedder(Protocol):
    name: str
    dim: int

    def embed(self, texts: list[str], kind: str = "document") -> np.ndarray: ...


class HashingEmbedder:
    def __init__(self, dim: int = 512):
        self.dim = dim
        self.name = f"hashing-{dim}"

    def _features(self, text: str) -> list[tuple[str, float]]:
        words = [_stem(w) for w in tokenize(text)]
        feats: list[tuple[str, float]] = [(f"w:{w}", 1.0) for w in words]
        feats += [(f"b:{a}_{b}", 0.6) for a, b in zip(words, words[1:])]
        for w in set(words):
            padded = f"#{w}#"
            feats += [(f"c:{padded[i:i + 3]}", 0.25) for i in range(len(padded) - 2)]
        return feats

    def embed(self, texts: list[str], kind: str = "document") -> np.ndarray:
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        for row, text in enumerate(texts):
            for feat, weight in self._features(text):
                h = int.from_bytes(hashlib.blake2b(feat.encode(), digest_size=8).digest(), "little")
                out[row, h % self.dim] += weight if (h >> 63) & 1 else -weight
        norms = np.linalg.norm(out, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return out / norms


class VoyageEmbedder:
    """Voyage AI embeddings (Anthropic's recommended embedding partner)."""

    def __init__(self, api_key: str, model: str = "voyage-3.5", dim: int = 1024):
        self.api_key = api_key
        self.model = model
        self.dim = dim
        self.name = f"voyage:{model}"
        self._client = httpx.Client(timeout=60)

    def embed(self, texts: list[str], kind: str = "document") -> np.ndarray:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), 128):
            batch = texts[start : start + 128]
            resp = self._client.post(
                "https://api.voyageai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"input": batch, "model": self.model, "input_type": "query" if kind == "query" else "document"},
            )
            resp.raise_for_status()
            vectors += [item["embedding"] for item in sorted(resp.json()["data"], key=lambda d: d["index"])]
        arr = np.asarray(vectors, dtype=np.float32)
        self.dim = arr.shape[1] if arr.size else self.dim
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return arr / norms


def build_embedder(provider: str, dim: int, voyage_key: str | None, voyage_model: str) -> Embedder:
    if provider == "voyage":
        if not voyage_key:
            raise ValueError("ENAZ_VOYAGE_API_KEY is required for the voyage embedding provider")
        return VoyageEmbedder(voyage_key, voyage_model)
    return HashingEmbedder(dim)
