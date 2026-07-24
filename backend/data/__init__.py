"""Raw market-data layer: fetching + caching of prices and sector metadata.

Import submodules explicitly (e.g. ``from backend.data import cache``) so that
pulling in this package does not eagerly import yfinance/pandas unless needed.
"""
