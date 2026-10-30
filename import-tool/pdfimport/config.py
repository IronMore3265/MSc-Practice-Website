"""Detection thresholds. All lengths are PDF points (1/72 inch). The review screen fixes what these miss."""
from dataclasses import asdict, dataclass, fields


@dataclass
class Settings:
    dpi: int = 300  # resolution of rendered figures
    max_render_px: int = 4000  # longest side; the dpi is lowered for very large regions
    min_side: float = 28.0  # smaller vector clusters are rules, bullets or icons
    min_image_side: float = 24.0
    min_area: float = 2400.0
    max_page_fraction: float = 0.85  # bigger regions are page backgrounds or frames
    merge_gap: float = 10.0  # pieces closer than this form one figure
    margin_fraction: float = 0.06  # vector-only clusters in the top and bottom margin are headers and footers
    min_vector_items: int = 4  # a shaded text box has one rectangle, a diagram has many shapes
    text_heavy_chars: int = 500
    caption_gap: float = 36.0
    keep_repeated: bool = False  # images that sit on most pages (logos) are skipped unless this is set
    repeat_min_pages: int = 3
    repeat_fraction: float = 0.5
    max_embedded_bytes: int = 8_000_000

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "Settings":
        known = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in known})
