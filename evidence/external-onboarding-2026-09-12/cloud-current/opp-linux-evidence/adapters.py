"""Human-authored adapters to installed, independently maintained libraries.

These wrappers are NOT external projects, automatically generated bridges, or
independent consumer attestations. The imports below execute the real libraries.
"""


def boltons_producer(items: list[str]) -> dict:
    from boltons.iterutils import unique
    return {'item_list': unique(items)}


def more_producer(items: list[str]) -> dict:
    from more_itertools import unique_everseen
    return {'item_list': list(unique_everseen(items))}


def jmespath_producer(items: list[str]) -> dict:
    import jmespath
    return {'item_list': jmespath.search('sort(@)', items)}


def more_consumer(items: list[str]) -> dict:
    from more_itertools import chunked
    return {'chunks': list(chunked(items, 2))}


def jmespath_consumer(items: list[str]) -> dict:
    import jmespath
    return {'values': jmespath.search('sort(@)', items)}


def boltons_consumer(items: list[str]) -> dict:
    from boltons.iterutils import unique
    return {'values': unique(items)}


def consume_more(itemList):
    return more_consumer(itemList)


def consume_jmespath(itemList):
    return jmespath_consumer(itemList)


def consume_boltons(itemList):
    return boltons_consumer(itemList)
