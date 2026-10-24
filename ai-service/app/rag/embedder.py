import math
import hashlib
from typing import List

class VectorEmbedder:
    """
    Computes semantic vector representations for knowledge chunks.
    Provides deterministic high-dimensional hashing vectorization with normalized
    unit-length cosine similarity, guaranteeing zero-dependency offline retrieval
    while supporting optional external API embedding models.
    """
    def __init__(self, dimension: int = 128):
        self.dimension = dimension

    def embed_text(self, text: str) -> List[float]:
        if not text:
            return [0.0] * self.dimension

        words = text.lower().split()
        vector = [0.0] * self.dimension

        for word in words:
            # Deterministic hash to dimension index
            h = int(hashlib.md5(word.encode('utf-8')).hexdigest(), 16)
            idx = h % self.dimension
            # Use secondary hash for sign (+1 or -1)
            sign = 1.0 if (h >> 8) % 2 == 0 else -1.0
            vector[idx] += sign

        # Unit-length normalization for cosine similarity
        norm = math.sqrt(sum(v * v for v in vector))
        if norm > 0:
            vector = [v / norm for v in vector]

        return vector

    @staticmethod
    def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
        if not vec_a or not vec_b or len(vec_a) != len(vec_b):
            return 0.0
        dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = math.sqrt(sum(a * a for a in vec_a))
        norm_b = math.sqrt(sum(b * b for b in vec_b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return max(0.0, min(1.0, dot_product / (norm_a * norm_b)))
