"""
Apoyo para los archivos CSV que se descargan (ventas y cierres de caja).

Excel trata como fórmula una celda que empieza con =, +, - o @. Un nombre de
producto como "=HYPERLINK(...)" se ejecutaría al abrir el archivo, así que esos
textos se escriben con un apóstrofo al inicio para que queden como texto.
"""

FORMULA_PREFIXES = ('=', '+', '-', '@', '\t', '\r')


def csv_safe(value):
    """Devuelve el valor listo para el CSV; solo cambia textos que parecen fórmula."""
    if isinstance(value, str) and value.startswith(FORMULA_PREFIXES):
        return f"'{value}"
    return value


def safe_row(values):
    """Aplica csv_safe a cada celda de una fila."""
    return [csv_safe(value) for value in values]
