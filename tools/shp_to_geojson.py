#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
轻量 Shapefile → GeoJSON 转换脚本（仅依赖 pyshp）。

用法示例（Windows PowerShell）：
    # 推荐使用单行命令（避免 PowerShell 续行转义差异）
    python tools/shp_to_geojson.py --input "C:\\Users\\17799\\Documents\\QACSM接收文件\\地理信息数据\\zj_city.shp" --output "static\\geo\\zhejiang_cities.geo.json" --encoding gbk --name-field NAME

    # 如需分行，请使用 PowerShell 反引号 ` 作为续行符，例如：
    # python tools/shp_to_geojson.py `
    #   --input "C:\\Users\\17799\\Documents\\QACSM接收文件\\地理信息数据\\zj_city.shp" `
    #   --output "static\\geo\\zhejiang_cities.geo.json" `
    #   --encoding gbk `
    #   --name-field NAME

注意：
- 本工具不做坐标投影转换，建议你的 Shapefile 已为 WGS84（EPSG:4326）。
- 如需投影转换，请先用 QGIS/ogr2ogr 处理后再用本脚本导出。
"""
from __future__ import annotations
import argparse
import json
import os
import sys
from typing import Dict, Any, List

try:
    import shapefile  # pyshp
except Exception as e:
    print("请先安装 pyshp：pip install pyshp", file=sys.stderr)
    raise

CITY_NAME_ALIASES = {
    '杭州市': '杭州', 'Hangzhou': '杭州', 'HANGZHOU': '杭州', 'HZ': '杭州',
    '宁波市': '宁波', 'Ningbo': '宁波', 'NINGBO': '宁波', 'NB': '宁波',
    '温州市': '温州', 'Wenzhou': '温州', 'WENZHOU': '温州', 'WZ': '温州',
    '嘉兴市': '嘉兴', 'Jiaxing': '嘉兴', 'JIAXING': '嘉兴', 'JX': '嘉兴',
    '湖州市': '湖州', 'Huzhou': '湖州', 'HUZHOU': '湖州', 'HZH': '湖州',
    '绍兴市': '绍兴', 'Shaoxing': '绍兴', 'SHAOXING': '绍兴', 'SX': '绍兴',
    '金华市': '金华', 'Jinhua': '金华', 'JINHUA': '金华', 'JH': '金华',
    '衢州市': '衢州', 'Quzhou': '衢州', 'QUZHOU': '衢州', 'QZ': '衢州',
    '舟山市': '舟山', 'Zhoushan': '舟山', 'ZHOUSHAN': '舟山', 'ZS': '舟山',
    '台州市': '台州', 'Taizhou': '台州', 'TAIZHOU': '台州', 'TZ': '台州',
    '丽水市': '丽水', 'Lishui': '丽水', 'LISHUI': '丽水', 'LS': '丽水',
}


def normalize_city_name(raw: Any) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    if s in CITY_NAME_ALIASES:
        return CITY_NAME_ALIASES[s]
    if s.endswith('市'):
        s2 = s[:-1]
        if s2 in CITY_NAME_ALIASES:
            return CITY_NAME_ALIASES[s2]
        return s2
    return s


def convert(input_path: str, output_path: str, encoding: str = 'utf-8', name_field: str | None = None, allow_geometry_only: bool = False) -> int:
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"找不到输入 Shapefile: {input_path}")

    base, ext = os.path.splitext(input_path)
    shp_path = base + '.shp'
    shx_path = base + '.shx'
    dbf_path = base + '.dbf'

    dbf_exists = os.path.exists(dbf_path)
    shx_exists = os.path.exists(shx_path)

    if not dbf_exists and not allow_geometry_only:
        raise FileNotFoundError(
            "未找到 DBF 属性文件: " + dbf_path + "\n"
            "Shapefile 需要 .shp/.shx/.dbf 同名三件套。\n"
            "请将 .dbf 放到同目录并与 .shp 同名，或使用 --allow-geometry-only 仅导出几何（无城市名属性）。"
        )

    # 读取 Shapefile（若无 dbf，则仅加载几何）
    kwargs = {'shp': shp_path}
    if shx_exists:
        kwargs['shx'] = shx_path
    if dbf_exists:
        kwargs['dbf'] = dbf_path
        kwargs['encoding'] = encoding
    r = shapefile.Reader(**kwargs)

    # 字段名（去掉第一个删除标记）
    fields = r.fields[1:]
    field_names = [f[0] for f in fields]

    features: List[Dict[str, Any]] = []

    if dbf_exists:
        for sr in r.iterShapeRecords():
            shape = sr.shape
            record = sr.record
            props = {k: v for k, v in zip(field_names, record)}

            # 取城市名标准化：优先 name_field；否则尝试 name/city/NAME
            candidate = None
            if name_field and name_field in props:
                candidate = props.get(name_field)
            else:
                for key in ('name', 'NAME', 'city', 'City', 'CITY'):
                    if key in props:
                        candidate = props[key]
                        break
            name_std = normalize_city_name(candidate)
            if name_std:
                props['name'] = name_std  # 输出里保留标准化 name 字段

            # 形状转 GeoJSON 几何
            try:
                geom = shape.__geo_interface__  # pyshp 提供
            except Exception:
                geom = None
            if not geom:
                continue

            features.append({
                'type': 'Feature',
                'properties': props,
                'geometry': geom,
            })
    else:
        # 无 DBF：仅导出几何，属性为空
        for shape in r.iterShapes():
            try:
                geom = shape.__geo_interface__
            except Exception:
                geom = None
            if not geom:
                continue
            features.append({
                'type': 'Feature',
                'properties': {},
                'geometry': geom,
            })

    fc = {
        'type': 'FeatureCollection',
        'features': features,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(fc, f, ensure_ascii=False, indent=2)

    return len(features)


def main():
    p = argparse.ArgumentParser(description='Shapefile → GeoJSON 轻量转换（pyshp）')
    p.add_argument('--input', required=True, help='输入 .shp 文件路径')
    p.add_argument('--output', required=True, help='输出 .geo.json 或 .json 文件路径')
    p.add_argument('--encoding', default='utf-8', help='DBF 字段编码，常见 gbk/utf-8，默认 utf-8')
    p.add_argument('--name-field', default=None, help='用于城市名的字段名（可选）')
    p.add_argument('--allow-geometry-only', action='store_true', help='缺少 .dbf 时允许仅导出几何（无属性）')
    args = p.parse_args()

    count = convert(
        args.input,
        args.output,
        encoding=args.encoding,
        name_field=args.name_field,
        allow_geometry_only=args.allow_geometry_only,
    )
    print(f'转换完成: {count} 个要素 → {args.output}')


if __name__ == '__main__':
    main()
