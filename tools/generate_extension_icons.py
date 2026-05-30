from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / 'public' / 'icons'
SIZES = (16, 32, 48, 128)


def clamp(value: float, low: int = 0, high: int = 255) -> int:
  return low if value < low else high if value > high else int(value)


def blend(dst: tuple[int, int, int, int], src: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
  sr, sg, sb, sa = src
  if sa <= 0:
    return dst

  dr, dg, db, da = dst
  sa_n = sa / 255.0
  da_n = da / 255.0
  out_a = sa_n + da_n * (1 - sa_n)
  if out_a <= 0:
    return (0, 0, 0, 0)

  out_r = (sr * sa_n + dr * da_n * (1 - sa_n)) / out_a
  out_g = (sg * sa_n + dg * da_n * (1 - sa_n)) / out_a
  out_b = (sb * sa_n + db * da_n * (1 - sa_n)) / out_a
  return (clamp(out_r), clamp(out_g), clamp(out_b), clamp(out_a * 255))


def point_in_polygon(x: float, y: float, points: list[tuple[float, float]]) -> bool:
  inside = False
  j = len(points) - 1
  for i, (xi, yi) in enumerate(points):
    xj, yj = points[j]
    if (yi > y) != (yj > y):
      cross = (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi
      if x < cross:
        inside = not inside
    j = i
  return inside


def write_png(path: Path, width: int, height: int, pixels: list[tuple[int, int, int, int]]) -> None:
  raw = bytearray()
  index = 0
  for _ in range(height):
    raw.append(0)
    for _ in range(width):
      raw.extend(bytes(pixels[index]))
      index += 1

  def chunk(tag: bytes, data: bytes) -> bytes:
    return (
      struct.pack('>I', len(data))
      + tag
      + data
      + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    )

  png = bytearray(b'\x89PNG\r\n\x1a\n')
  png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
  png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
  png += chunk(b'IEND', b'')
  path.write_bytes(png)


def render_icon(size: int) -> list[tuple[int, int, int, int]]:
  supersample = 4
  width = height = size * supersample
  pixels = [(0, 0, 0, 0) for _ in range(width * height)]

  def set_pixel(x: int, y: int, color: tuple[int, int, int, int]) -> None:
    if 0 <= x < width and 0 <= y < height:
      index = y * width + x
      pixels[index] = blend(pixels[index], color)

  def fill_circle(cx: float, cy: float, radius: float, color: tuple[int, int, int, int]) -> None:
    min_x = max(0, int(cx - radius - 1))
    max_x = min(width - 1, int(cx + radius + 1))
    min_y = max(0, int(cy - radius - 1))
    max_y = min(height - 1, int(cy + radius + 1))
    radius_sq = radius * radius
    for y in range(min_y, max_y + 1):
      for x in range(min_x, max_x + 1):
        dx = x + 0.5 - cx
        dy = y + 0.5 - cy
        if dx * dx + dy * dy <= radius_sq:
          set_pixel(x, y, color)

  def fill_round_rect(
    x: float,
    y: float,
    rect_width: float,
    rect_height: float,
    radius: float,
    color_fn,
  ) -> None:
    for py in range(max(0, int(y)), min(height, int(y + rect_height))):
      for px in range(max(0, int(x)), min(width, int(x + rect_width))):
        inside = False
        if (x + radius) <= px + 0.5 <= (x + rect_width - radius) or (y + radius) <= py + 0.5 <= (y + rect_height - radius):
          inside = True
        else:
          corners = [
            (x + radius, y + radius),
            (x + rect_width - radius, y + radius),
            (x + radius, y + rect_height - radius),
            (x + rect_width - radius, y + rect_height - radius),
          ]
          for cx, cy in corners:
            dx = px + 0.5 - cx
            dy = py + 0.5 - cy
            if dx * dx + dy * dy <= radius * radius:
              inside = True
              break
        if inside:
          set_pixel(px, py, color_fn(px, py))

  def fill_polygon(points: list[tuple[float, float]], color: tuple[int, int, int, int]) -> None:
    min_x = max(0, int(min(point[0] for point in points)))
    max_x = min(width - 1, int(max(point[0] for point in points)))
    min_y = max(0, int(min(point[1] for point in points)))
    max_y = min(height - 1, int(max(point[1] for point in points)))
    for py in range(min_y, max_y + 1):
      for px in range(min_x, max_x + 1):
        if point_in_polygon(px + 0.5, py + 0.5, points):
          set_pixel(px, py, color)

  def draw_star(
    cx: float,
    cy: float,
    outer_radius: float,
    inner_radius: float,
    color_start: tuple[int, int, int],
    color_end: tuple[int, int, int],
  ) -> None:
    points: list[tuple[float, float]] = []
    for index in range(8):
      angle = -math.pi / 2 + index * math.pi / 4
      radius = outer_radius if index % 2 == 0 else inner_radius
      points.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))

    min_y = max(0, int(cy - outer_radius - 1))
    max_y = min(height - 1, int(cy + outer_radius + 1))
    min_x = max(0, int(cx - outer_radius - 1))
    max_x = min(width - 1, int(cx + outer_radius + 1))

    for py in range(min_y, max_y + 1):
      t = (py - min_y) / max(1, max_y - min_y)
      color = (
        int(color_start[0] * (1 - t) + color_end[0] * t),
        int(color_start[1] * (1 - t) + color_end[1] * t),
        int(color_start[2] * (1 - t) + color_end[2] * t),
        255,
      )
      for px in range(min_x, max_x + 1):
        if point_in_polygon(px + 0.5, py + 0.5, points):
          set_pixel(px, py, color)

  def downsample() -> list[tuple[int, int, int, int]]:
    output: list[tuple[int, int, int, int]] = []
    for y in range(size):
      for x in range(size):
        red = green = blue = alpha = 0
        for dy in range(supersample):
          for dx in range(supersample):
            pixel = pixels[(y * supersample + dy) * width + (x * supersample + dx)]
            red += pixel[0]
            green += pixel[1]
            blue += pixel[2]
            alpha += pixel[3]
        sample_count = supersample * supersample
        output.append((red // sample_count, green // sample_count, blue // sample_count, alpha // sample_count))
    return output

  fill_circle(width / 2, height / 2, width * 0.45, (52, 188, 255, 72))

  def background_color(px: int, py: int) -> tuple[int, int, int, int]:
    start = (31, 40, 88)
    end = (87, 104, 206)
    t = (px / max(1, width - 1)) * 0.58 + (py / max(1, height - 1)) * 0.42
    return (
      int(start[0] * (1 - t) + end[0] * t),
      int(start[1] * (1 - t) + end[1] * t),
      int(start[2] * (1 - t) + end[2] * t),
      255,
    )

  inset = width * 0.08
  fill_round_rect(inset, inset, width - inset * 2, height - inset * 2, width * 0.24, background_color)

  bubble_x = width * 0.20
  bubble_y = height * 0.28
  bubble_width = width * 0.50
  bubble_height = height * 0.34
  fill_round_rect(
    bubble_x,
    bubble_y,
    bubble_width,
    bubble_height,
    width * 0.11,
    lambda _px, _py: (246, 249, 255, 255),
  )
  fill_polygon(
    [
      (bubble_x + bubble_width * 0.28, bubble_y + bubble_height - 2),
      (bubble_x + bubble_width * 0.42, bubble_y + bubble_height - 2),
      (bubble_x + bubble_width * 0.20, bubble_y + bubble_height + width * 0.11),
    ],
    (246, 249, 255, 255),
  )

  line_color = (89, 107, 191, 255)
  thickness = max(2, int(width * 0.024))
  for row in range(3):
    y = int(bubble_y + bubble_height * (0.30 + row * 0.21))
    line_start = int(bubble_x + bubble_width * 0.17)
    line_end = int(bubble_x + bubble_width * (0.79 if row < 2 else 0.60))
    for py in range(y - thickness // 2, y + thickness // 2 + 1):
      for px in range(line_start, line_end):
        set_pixel(px, py, line_color)

  draw_star(width * 0.73, height * 0.31, width * 0.10, width * 0.04, (121, 230, 255), (161, 117, 255))
  draw_star(width * 0.81, height * 0.58, width * 0.05, width * 0.022, (255, 217, 112), (255, 137, 89))
  fill_circle(width * 0.69, height * 0.68, width * 0.03, (151, 236, 255, 255))

  return downsample()


def main() -> None:
  ROOT.mkdir(parents=True, exist_ok=True)
  for size in SIZES:
    pixels = render_icon(size)
    output_path = ROOT / f'chaojia-{size}.png'
    write_png(output_path, size, size, pixels)
    print(f'generated {output_path}')


if __name__ == '__main__':
  main()
