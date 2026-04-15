"""
tree-sitter based parser for Python and TypeScript.
Returns ParsedCode with function metadata and call graph.
"""
from pathlib import Path
from .schemas import FunctionInfo, ParsedCode

def parse_file(path: str | Path) -> ParsedCode:
    source = Path(path).read_text(encoding="utf-8")
    suffix = Path(path).suffix.lower()

    if suffix == ".py":
        return _parse_python(source)
    elif suffix in (".ts", ".tsx"):
        return _parse_typescript(source)
    elif suffix in (".js", ".jsx"):
        return _parse_javascript(source)
    else:
        raise ValueError(f"Unsupported file extension: {suffix}")


def parse_source(source: str, language: str) -> ParsedCode:
    """Parse source code string directly."""
    if language == "python":
        return _parse_python(source)
    elif language in ("typescript", "javascript"):
        return _parse_typescript(source)
    else:
        raise ValueError(f"Unsupported language: {language}")


def _parse_python(source: str) -> ParsedCode:
    try:
        import tree_sitter_python as tspython
        from tree_sitter import Language, Parser

        PY_LANGUAGE = Language(tspython.language())
        parser = Parser(PY_LANGUAGE)
        tree = parser.parse(bytes(source, "utf-8"))

        functions = _extract_python_functions(tree.root_node, source)
        top_level_calls = _extract_top_level_calls_python(tree.root_node, source)

    except Exception:
        # Graceful fallback: basic regex-based extraction
        functions, top_level_calls = _fallback_python_parse(source)

    return ParsedCode(
        language="python",
        raw_source=source,
        functions=functions,
        top_level_calls=top_level_calls,
    )


def _extract_python_functions(node, source: str) -> list[FunctionInfo]:
    functions = []
    source_bytes = source.encode("utf-8")

    def walk(n):
        if n.type == "function_definition":
            name_node = n.child_by_field_name("name")
            params_node = n.child_by_field_name("parameters")
            name = source_bytes[name_node.start_byte:name_node.end_byte].decode("utf-8") if name_node else "unknown"

            # Extract parameter names
            params = []
            if params_node:
                for child in params_node.children:
                    if child.type == "identifier":
                        params.append(source_bytes[child.start_byte:child.end_byte].decode("utf-8"))

            # Find calls within this function
            calls = []
            body_node = n.child_by_field_name("body")
            if body_node:
                _find_calls(body_node, source_bytes, calls)

            is_recursive = name in calls
            body_text = source_bytes[n.start_byte:n.end_byte].decode("utf-8")

            functions.append(FunctionInfo(
                name=name,
                params=params,
                is_recursive=is_recursive,
                calls=list(set(calls)),
                body_lines=body_text.count("\n") + 1,
            ))

        for child in n.children:
            walk(child)

    walk(node)
    return functions


def _find_calls(node, source_bytes: bytes, calls: list):
    if node.type == "call":
        func_node = node.child_by_field_name("function")
        if func_node:
            if func_node.type == "identifier":
                calls.append(source_bytes[func_node.start_byte:func_node.end_byte].decode("utf-8"))
    for child in node.children:
        _find_calls(child, source_bytes, calls)


def _extract_top_level_calls_python(node, source: str) -> list[str]:
    calls = []
    source_bytes = source.encode("utf-8")
    for child in node.children:
        if child.type in ("expression_statement", "assignment"):
            _find_calls(child, source_bytes, calls)
    return list(set(calls))


def _fallback_python_parse(source: str):
    """Regex fallback when tree-sitter is unavailable."""
    import re

    func_pattern = re.compile(r"^def\s+(\w+)\s*\(([^)]*)\):", re.MULTILINE)
    call_pattern = re.compile(r"(\w+)\s*\(")

    functions = []
    for m in func_pattern.finditer(source):
        name = m.group(1)
        params_str = m.group(2)
        params = [p.strip() for p in params_str.split(",") if p.strip()]

        # Find function body (rough approximation)
        start = m.start()
        next_func = func_pattern.search(source, m.end())
        end = next_func.start() if next_func else len(source)
        body = source[start:end]

        calls = [c for c in call_pattern.findall(body) if c != name or True]
        is_recursive = name in calls

        functions.append(FunctionInfo(
            name=name,
            params=params,
            is_recursive=is_recursive,
            calls=list(set(calls)),
            body_lines=body.count("\n") + 1,
        ))

    top_level_calls = []
    for line in source.split("\n"):
        if not line.startswith("def ") and not line.startswith(" ") and not line.startswith("\t"):
            for m in call_pattern.finditer(line):
                top_level_calls.append(m.group(1))

    return functions, list(set(top_level_calls))


def _parse_typescript(source: str) -> ParsedCode:
    try:
        import tree_sitter_typescript as tsts
        from tree_sitter import Language, Parser

        TS_LANGUAGE = Language(tsts.language_typescript())
        parser = Parser(TS_LANGUAGE)
        tree = parser.parse(bytes(source, "utf-8"))
        functions = _extract_ts_functions(tree.root_node, source)
        top_level_calls = []

    except Exception:
        functions = []
        top_level_calls = []

    return ParsedCode(
        language="typescript",
        raw_source=source,
        functions=functions,
        top_level_calls=top_level_calls,
    )


def _parse_javascript(source: str) -> ParsedCode:
    """Parse JavaScript — uses TypeScript parser as fallback."""
    result = _parse_typescript(source)
    # Patch language field
    return ParsedCode(
        language="javascript",
        raw_source=source,
        functions=result.functions,
        top_level_calls=result.top_level_calls,
    )


def _extract_ts_functions(node, source: str) -> list[FunctionInfo]:
    """Extract function declarations and arrow functions from TypeScript AST."""
    functions = []
    source_bytes = source.encode("utf-8")

    def walk(n):
        if n.type in ("function_declaration", "function_expression", "arrow_function"):
            name = "anonymous"
            params = []
            calls = []

            name_node = n.child_by_field_name("name")
            if name_node:
                name = source_bytes[name_node.start_byte:name_node.end_byte].decode("utf-8")

            params_node = n.child_by_field_name("parameters")
            if params_node:
                for child in params_node.children:
                    if child.type in ("identifier", "required_parameter"):
                        params.append(source_bytes[child.start_byte:child.end_byte].decode("utf-8"))

            body_node = n.child_by_field_name("body")
            if body_node:
                _find_calls(body_node, source_bytes, calls)

            body_text = source_bytes[n.start_byte:n.end_byte].decode("utf-8")
            functions.append(FunctionInfo(
                name=name,
                params=params,
                is_recursive=name in calls,
                calls=list(set(calls)),
                body_lines=body_text.count("\n") + 1,
            ))

        for child in n.children:
            walk(child)

    walk(node)
    return functions
