#include <cmark-gfm.h>
#include <cmark-gfm-core-extensions.h>
#include <cmark-gfm-extension_api.h>
#include <nlohmann/json.hpp>
#include <yaml-cpp/yaml.h>
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace {
using Json = nlohmann::json;
constexpr std::size_t max_document = 2 * 1024 * 1024;
constexpr std::size_t max_frontmatter = 64 * 1024;

std::string read_document(const std::filesystem::path& path) {
    if (!std::filesystem::is_regular_file(path) || std::filesystem::file_size(path) > max_document)
        throw std::runtime_error("not a regular document of at most 2 MiB");
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot open document");
    std::string text(max_document + 1, '\0');
    in.read(text.data(), static_cast<std::streamsize>(text.size()));
    if (in.bad() || text.size() == 0 || static_cast<std::size_t>(in.gcount()) > max_document)
        throw std::runtime_error("read failure or oversized document");
    text.resize(static_cast<std::size_t>(in.gcount()));
    if (text.find('\0') != std::string::npos) throw std::runtime_error("NUL in document");
    // nlohmann's strict serializer rejects invalid UTF-8 before any parser sees it.
    (void)Json(text).dump();
    if (text.starts_with("\xEF\xBB\xBF")) text.erase(0, 3);
    std::string normalized;
    normalized.reserve(text.size());
    for (std::size_t i = 0; i < text.size(); ++i) {
        if (text[i] == '\r') {
            if (i + 1 < text.size() && text[i + 1] == '\n') ++i;
            normalized += '\n';
        } else normalized += text[i];
    }
    return normalized;
}

struct Document { std::string yaml; std::string markdown; };

Document split_frontmatter(const std::string& text) {
    if (!text.starts_with("---\n")) throw std::runtime_error("expected YAML front matter");
    std::size_t pos = 4;
    while (pos <= text.size()) {
        const auto end = text.find('\n', pos);
        const auto stop = end == std::string::npos ? text.size() : end;
        if (pos > max_frontmatter + 4) throw std::runtime_error("front matter too large");
        if (text.compare(pos, stop - pos, "---") == 0) {
            return {text.substr(4, pos - 4), end == std::string::npos ? "" : text.substr(end + 1)};
        }
        if (end == std::string::npos) break;
        pos = end + 1;
    }
    throw std::runtime_error("unterminated front matter");
}

// Preserve scalar spelling (especially RFC3339 dates); Rust owns the typed schema.
// Bound traversal to reject recursive aliases and expansive documents, and reject
// duplicate keys rather than accepting YAML's ambiguous last-write-wins behavior.
Json convert_yaml(const YAML::Node& node, unsigned depth, std::size_t& budget) {
    if (depth > 16 || budget == 0) throw std::runtime_error("front matter exceeds complexity limit");
    --budget;
    if (node.IsNull()) return nullptr;
    if (node.IsScalar()) return node.Scalar();
    if (node.IsSequence()) {
        auto out = Json::array();
        for (const auto& item : node) out.push_back(convert_yaml(item, depth + 1, budget));
        return out;
    }
    if (node.IsMap()) {
        auto out = Json::object();
        for (const auto& item : node) {
            if (!item.first.IsScalar()) throw std::runtime_error("non-scalar metadata key");
            const auto key = item.first.Scalar();
            if (key.empty() || key == "<<" || out.contains(key))
                throw std::runtime_error("empty, merge or duplicate metadata key: " + key);
            out[key] = convert_yaml(item.second, depth + 1, budget);
        }
        return out;
    }
    throw std::runtime_error("unsupported YAML node");
}

Json metadata(const std::string& yaml) {
    const auto docs = YAML::LoadAll(yaml);
    if (docs.size() != 1 || !docs.front().IsMap()) throw std::runtime_error("expected one YAML mapping");
    std::size_t budget = 4096;
    return convert_yaml(docs.front(), 0, budget);
}

using Parser = std::unique_ptr<cmark_parser, decltype(&cmark_parser_free)>;
using Node = std::unique_ptr<cmark_node, decltype(&cmark_node_free)>;
using Iter = std::unique_ptr<cmark_iter, decltype(&cmark_iter_free)>;

std::string plain_text(cmark_node* root) {
    Iter iter(cmark_iter_new(root), cmark_iter_free);
    std::string result;
    for (auto event = cmark_iter_next(iter.get()); event != CMARK_EVENT_DONE; event = cmark_iter_next(iter.get())) {
        auto* node = cmark_iter_get_node(iter.get());
        const auto kind = cmark_node_get_type(node);
        if (event == CMARK_EVENT_ENTER) {
            if (kind == CMARK_NODE_TEXT || kind == CMARK_NODE_CODE || kind == CMARK_NODE_CODE_BLOCK) {
                if (const char* literal = cmark_node_get_literal(node)) result += literal;
            } else if (kind == CMARK_NODE_SOFTBREAK || kind == CMARK_NODE_LINEBREAK) result += ' ';
        } else if (kind == CMARK_NODE_PARAGRAPH || kind == CMARK_NODE_HEADING ||
                   kind == CMARK_NODE_ITEM || kind == CMARK_NODE_CODE_BLOCK) result += '\n';
    }
    return result;
}

bool safe_destination(std::string_view destination, bool image) {
    if (destination.empty() || std::any_of(destination.begin(), destination.end(), [](unsigned char c) {
            return c <= 32 || c == 127 || c == '\\';
        })) return false;
    if (destination.starts_with("/") && !destination.starts_with("//")) return true;
    if (!image && destination.starts_with("#")) return true;
    std::string lower(destination);
    std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) { return std::tolower(c); });
    return lower.starts_with("https://") || (!image && (lower.starts_with("http://") || lower.starts_with("mailto:")));
}

Json parse_markdown(const std::string& source) {
    // GitHub's CommonMark reference implementation performs block and inline
    // tokenization, delimiter resolution, entity decoding, and AST construction.
    constexpr int options = CMARK_OPT_DEFAULT | CMARK_OPT_VALIDATE_UTF8;
    cmark_gfm_core_extensions_ensure_registered();
    Parser parser(cmark_parser_new(options), cmark_parser_free);
    if (!parser) throw std::runtime_error("cannot allocate Markdown parser");
    for (const char* name : {"table", "strikethrough", "autolink", "tasklist"}) {
        auto* extension = cmark_find_syntax_extension(name);
        if (!extension || !cmark_parser_attach_syntax_extension(parser.get(), extension))
            throw std::runtime_error(std::string("cannot attach Markdown extension: ") + name);
    }
    cmark_parser_feed(parser.get(), source.data(), source.size());
    Node root(cmark_parser_finish(parser.get()), cmark_node_free);
    if (!root) throw std::runtime_error("cannot parse Markdown");
    auto headings = Json::array();
    auto links = Json::array();
    Iter iter(cmark_iter_new(root.get()), cmark_iter_free);
    int previous_level = 1;
    for (auto event = cmark_iter_next(iter.get()); event != CMARK_EVENT_DONE; event = cmark_iter_next(iter.get())) {
        if (event != CMARK_EVENT_ENTER) continue;
        auto* node = cmark_iter_get_node(iter.get());
        auto type = cmark_node_get_type(node);
        if (type == CMARK_NODE_HTML_BLOCK || type == CMARK_NODE_HTML_INLINE)
            throw std::runtime_error("raw HTML is not allowed at body line " + std::to_string(cmark_node_get_start_line(node)));
        if (type == CMARK_NODE_HEADING) {
            const int level = cmark_node_get_heading_level(node);
            if (level < 2 || level > previous_level + 1)
                throw std::runtime_error("heading hierarchy must begin at h2 and may not skip levels");
            previous_level = level;
            auto label = plain_text(node);
            while (!label.empty() && label.back() == '\n') label.pop_back();
            headings.push_back({{"level", level}, {"text", label}, {"line", cmark_node_get_start_line(node)}});
        }
        if (type == CMARK_NODE_LINK || type == CMARK_NODE_IMAGE) {
            const auto* url = cmark_node_get_url(node);
            const bool image = type == CMARK_NODE_IMAGE;
            if (!url || !safe_destination(url, image))
                throw std::runtime_error("unsupported or unsafe Markdown destination at body line " + std::to_string(cmark_node_get_start_line(node)));
            const auto label = plain_text(node);
            if (image && label.empty()) throw std::runtime_error("images require alternative text");
            links.push_back({{"kind", image ? "image" : "link"}, {"label", label}, {"url", url}});
        }
    }
    // Do not set CMARK_OPT_UNSAFE. Only this renderer output crosses the trusted
    // HTML boundary; every other template value is escaped by Rust.
    std::unique_ptr<char, decltype(&std::free)> html(
        cmark_render_html(root.get(), options, cmark_parser_get_syntax_extensions(parser.get())), std::free);
    if (!html) throw std::runtime_error("cannot render Markdown");
    return {{"html", html.get()}, {"plain_text", plain_text(root.get())},
            {"headings", headings}, {"links", links}};
}
} // namespace

int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "usage: markdown-parser <document.md>\n";
        return 2;
    }
    try {
        const auto doc = split_frontmatter(read_document(argv[1]));
        auto result = parse_markdown(doc.markdown);
        result["metadata"] = metadata(doc.yaml);
        result["protocol"] = 1;
        std::cout << result.dump() << '\n';
        return 0;
    } catch (const std::exception& error) {
        std::cerr << argv[1] << ": " << error.what() << '\n';
        return 1;
    }
}
