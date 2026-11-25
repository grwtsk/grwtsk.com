use anyhow::{Context, Result, bail, ensure};
use chrono::{DateTime, FixedOffset};
use minijinja::{Environment, UndefinedBehavior, Value as TemplateValue};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::{collections::BTreeSet, env, fs, path::{Path, PathBuf}, process::Command};
use url::Url;

const ORIGIN: &str = "https://grwtsk.com";
const REPO: &str = "https://github.com/grwtsk/grwtsk.com/blob/main/source/data/articles";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Parsed {
    protocol: u32,
    metadata: Value,
    html: String,
    plain_text: String,
    headings: Vec<Heading>,
    links: Vec<Link>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Heading { level: u32, text: String, line: u32 }

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Link { kind: String, label: String, url: String }

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ArticleMeta {
    title: String,
    slug: String,
    description: String,
    author: String,
    language: String,
    written_at: String,
    written_zone: Option<String>,
    published_at: Option<String>,
    modified_at: Option<String>,
    category: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    citations: Vec<String>,
}

#[derive(Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum Status { Written, Sent }

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StatusMeta {
    status: Status,
    #[serde(default)]
    sends: Vec<Send>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Send {
    at: String,
    recipient: String,
    method: String,
    reference: Option<String>,
    public_record: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ResponseMeta {
    title: String,
    from: String,
    received_at: String,
    public_record: Option<String>,
}

#[derive(Serialize)]
struct Response {
    #[serde(flatten)]
    meta: ResponseMeta,
    repository_url: String,
    display_date: String,
    #[serde(skip)]
    received: DateTime<FixedOffset>,
}

#[derive(Serialize)]
struct Article {
    #[serde(flatten)]
    meta: ArticleMeta,
    #[serde(skip)]
    created: DateTime<FixedOffset>,
    display_date: String,
    permalink: String,
    canonical: String,
    status: &'static str,
    status_code: &'static str,
    sends: Vec<Send>,
    responses: Vec<Response>,
    html: String,
    headings: Vec<Heading>,
    links: Vec<Link>,
    word_count: usize,
}

fn parse(parser: &Path, path: &Path) -> Result<Parsed> {
    ensure!(path.symlink_metadata()?.file_type().is_file(), "not a regular file: {}", path.display());
    let output = Command::new(parser).arg(path).output()
        .with_context(|| format!("executing parser for {}", path.display()))?;
    ensure!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let parsed: Parsed = serde_json::from_slice(&output.stdout)
        .with_context(|| format!("invalid parser response for {}", path.display()))?;
    ensure!(parsed.protocol == 1, "unsupported parser protocol");
    Ok(parsed)
}

fn typed<T: DeserializeOwned>(value: Value, path: &Path) -> Result<T> {
    serde_json::from_value(value).with_context(|| format!("invalid metadata in {}", path.display()))
}

fn nonempty(value: &str, field: &str) -> Result<()> {
    ensure!(!value.trim().is_empty() && !value.chars().any(char::is_control), "invalid {field}");
    Ok(())
}

fn slug(value: &str) -> bool {
    !value.is_empty() && value.len() <= 120 && value.split('-').all(|word|
        !word.is_empty() && word.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()))
}

fn timestamp(value: &str) -> Result<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(value).with_context(|| format!("invalid RFC3339 timestamp: {value}"))
}

fn display_date(date: &DateTime<FixedOffset>) -> String {
    date.format("%B %-d, %Y · %H:%M:%S %:z").to_string()
}

// A fixed offset alone does not establish a named timezone. Use only an
// explicitly recorded label with a matching offset; otherwise show the offset.
fn written_display(date: &DateTime<FixedOffset>, zone: Option<&str>) -> Result<String> {
    let Some(zone) = zone else { return Ok(display_date(date)); };
    let seconds = match zone {
        "PST" => -8 * 3600,
        "PDT" => -7 * 3600,
        "UTC" => 0,
        _ => bail!("unsupported written_zone: {zone}; omit it to display the offset"),
    };
    ensure!(date.offset().local_minus_utc() == seconds, "written_zone does not match written_at offset");
    Ok(format!("{} {zone}", date.format("%B %-d, %Y · %H:%M:%S")))
}

fn public_url(value: &str) -> Result<()> {
    let url = Url::parse(value).with_context(|| format!("invalid public URL: {value}"))?;
    ensure!(matches!(url.scheme(), "http" | "https") && url.host_str().is_some()
        && url.username().is_empty() && url.password().is_none()
        && !value.chars().any(char::is_control), "invalid public URL: {value}");
    Ok(())
}

fn validate_optional_url(value: &Option<String>) -> Result<()> {
    if let Some(url) = value { public_url(url)?; }
    Ok(())
}

fn entries(dir: &Path) -> Result<Vec<fs::DirEntry>> {
    let mut values = fs::read_dir(dir)?.collect::<std::io::Result<Vec<_>>>()?;
    values.sort_by_key(|entry| entry.file_name());
    Ok(values)
}

fn responses(parser: &Path, dir: &Path, id: &str, created: &DateTime<FixedOffset>) -> Result<Vec<Response>> {
    let mut result = Vec::new();
    ensure!(dir.symlink_metadata()?.file_type().is_dir(), "in must be a directory");
    for entry in entries(dir)? {
        let name = entry.file_name().into_string().map_err(|_| anyhow::anyhow!("non-UTF8 response filename"))?;
        if name == ".gitkeep" { ensure!(entry.file_type()?.is_file(), "invalid .gitkeep"); continue; }
        let Some(stem) = name.strip_suffix(".md") else { bail!("unexpected response file: {name}"); };
        ensure!(slug(stem) && entry.file_type()?.is_file(), "invalid response filename: {name}");
        let doc = parse(parser, &entry.path())?;
        let meta: ResponseMeta = typed(doc.metadata, &entry.path())?;
        nonempty(&meta.title, "response title")?;
        nonempty(&meta.from, "responding party")?;
        validate_optional_url(&meta.public_record)?;
        let received = timestamp(&meta.received_at)?;
        ensure!(&received >= created, "response precedes article");
        result.push(Response {
            display_date: display_date(&received),
            repository_url: format!("{REPO}/{id}/in/{name}"),
            meta, received,
        });
    }
    result.sort_by(|a, b| a.received.cmp(&b.received).then_with(|| a.repository_url.cmp(&b.repository_url)));
    Ok(result)
}

fn load_article(parser: &Path, dir: &Path) -> Result<Article> {
    let id = dir.file_name().and_then(|n| n.to_str()).context("invalid article directory")?;
    ensure!(slug(id), "invalid article directory slug: {id}");
    let path = dir.join("article.md");
    let doc = parse(parser, &path)?;
    let meta: ArticleMeta = typed(doc.metadata, &path)?;
    ensure!(meta.slug == id, "article slug must match directory: {id}");
    for (value, field) in [(&meta.title, "title"), (&meta.description, "description"),
        (&meta.author, "author"), (&meta.category, "category")] { nonempty(value, field)?; }
    ensure!(!meta.language.is_empty() && meta.language.len() <= 63 &&
        meta.language.split('-').all(|s| !s.is_empty() && s.len() <= 8 && s.bytes().all(|b| b.is_ascii_alphanumeric())),
        "invalid language tag");
    for tag in &meta.tags { nonempty(tag, "tag")?; }
    for citation in &meta.citations { public_url(citation)?; }
    let created = timestamp(&meta.written_at)?;
    let published = meta.published_at.as_deref().map(timestamp).transpose()?;
    let modified = meta.modified_at.as_deref().map(timestamp).transpose()?;
    if let Some(date) = published { ensure!(date >= created, "publication precedes writing"); }
    if let Some(date) = modified { ensure!(date >= created, "modification precedes writing"); }
    ensure!(!doc.plain_text.trim().is_empty(), "empty article: {id}");
    let status_path = dir.join("status.md");
    let status_doc = parse(parser, &status_path)?;
    ensure!(status_doc.plain_text.trim().is_empty(), "status.md is metadata only");
    let mut state: StatusMeta = typed(status_doc.metadata, &status_path)?;
    ensure!((state.status == Status::Written) == state.sends.is_empty(),
        "written requires no sends; sent requires at least one send");
    let mut prior = created;
    for send in &state.sends {
        let at = timestamp(&send.at)?;
        ensure!(at >= prior, "send records must be chronological and follow writing");
        prior = at;
        nonempty(&send.recipient, "send recipient")?;
        nonempty(&send.method, "send method")?;
        if let Some(reference) = &send.reference { nonempty(reference, "send reference")?; }
        validate_optional_url(&send.public_record)?;
    }
    let responses = responses(parser, &dir.join("in"), id, &created)?;
    let permalink = format!("/articles/{id}/");
    let canonical = format!("{ORIGIN}{permalink}");
    Ok(Article {
        display_date: written_display(&created, meta.written_zone.as_deref())?,
        status: match state.status { Status::Written => "Written", Status::Sent => "Sent" },
        status_code: match state.status { Status::Written => "written", Status::Sent => "sent" },
        sends: std::mem::take(&mut state.sends),
        responses, meta, created, permalink, canonical,
        html: doc.html, headings: doc.headings, links: doc.links,
        word_count: doc.plain_text.split_whitespace().count(),
    })
}

fn load_articles(parser: &Path, data: &Path) -> Result<Vec<Article>> {
    let mut articles = Vec::new();
    let mut seen = BTreeSet::new();
    for entry in entries(data)? {
        let kind = entry.file_type()?;
        if entry.file_name() == "README.md" && kind.is_file() { continue; }
        ensure!(kind.is_dir(), "unexpected data entry: {}", entry.path().display());
        let article = load_article(parser, &entry.path()).with_context(|| format!("loading {}", entry.path().display()))?;
        ensure!(seen.insert(article.meta.slug.clone()), "duplicate slug");
        articles.push(article);
    }
    articles.sort_by(|a, b| b.created.cmp(&a.created).then_with(|| a.meta.slug.cmp(&b.meta.slug)));
    Ok(articles)
}

fn article_schema(article: &Article) -> Value {
    let meta = &article.meta;
    let mut data = json!({
        "@type": "Article",
        "@id": format!("{}#article", article.canonical),
        "url": article.canonical,
        "mainEntityOfPage": {"@id": article.canonical},
        "isPartOf": {"@id": format!("{ORIGIN}/#website")},
        "name": meta.title,
        "headline": meta.title,
        "description": meta.description,
        "author": {"@type": "Person", "name": meta.author},
        "dateCreated": meta.written_at,
        "inLanguage": meta.language,
        "articleSection": meta.category,
        "keywords": meta.tags,
        "wordCount": article.word_count
    });
    if let Some(value) = &meta.published_at { data["datePublished"] = json!(value); }
    if let Some(value) = &meta.modified_at { data["dateModified"] = json!(value); }
    if !meta.citations.is_empty() { data["citation"] = json!(meta.citations); }
    if !article.responses.is_empty() {
        // Responses are distinct works about the article, not parts of its
        // original text. Receipt time is not publication or authorship time.
        data["subjectOf"] = json!(article.responses.iter().map(|response| {
            let mut message = json!({
                "@type": "Message",
                "@id": response.repository_url,
                "url": response.repository_url,
                "name": response.meta.title,
                "about": {"@id": format!("{}#article", article.canonical)},
                "dateReceived": response.meta.received_at
            });
            if let Some(record) = &response.meta.public_record {
                message["citation"] = json!(record);
            }
            message
        }).collect::<Vec<_>>());
    }
    data
}

// JSON inside an HTML raw-text script element must not contain literal '<'.
// In particular this prevents metadata from closing the JSON-LD script.
fn script_json(value: &Value) -> Result<String> {
    Ok(serde_json::to_string(value)?.replace('&', "\\u0026").replace('<', "\\u003c")
        .replace('>', "\\u003e").replace('\u{2028}', "\\u2028").replace('\u{2029}', "\\u2029"))
}

fn templates() -> Result<Environment<'static>> {
    let mut env = Environment::new();
    env.set_undefined_behavior(UndefinedBehavior::Strict);
    env.add_template("layout.html", include_str!("../templates/layout.html"))?;
    env.add_template("full-article.html", include_str!("../templates/full-article.html"))?;
    env.add_template("homepage.html", include_str!("../templates/homepage.html"))?;
    env.add_template("article.html", include_str!("../templates/article.html"))?;
    Ok(env)
}

fn website_schema() -> Value {
    json!({"@type":"WebSite","@id":format!("{ORIGIN}/#website"),"url":format!("{ORIGIN}/"),
        "name":"Correspondence log"})
}

fn page_schema(canonical: &str, title: &str, description: &str, language: &str,
    article: Option<&Article>) -> Value {
    let mut page = json!({"@type":"WebPage","@id":canonical,"url":canonical,
        "name":title,"description":description,"inLanguage":language,
        "isPartOf":{"@id":format!("{ORIGIN}/#website")}});
    if let Some(article) = article {
        page["mainEntity"] = json!({"@id":format!("{}#article", article.canonical)});
    }
    page
}

fn render_site(articles: &[Article]) -> Result<Vec<(PathBuf, String)>> {
    let env = templates()?;
    let mut pages = Vec::new();
    let latest = articles.first();
    let past = articles.get(1..).unwrap_or_default();
    let home_url = format!("{ORIGIN}/");
    let language = latest.map(|a| a.meta.language.as_str()).unwrap_or("en");
    let description = latest.map(|a| a.meta.description.as_str()).unwrap_or("Correspondence log");
    let mut home_page = page_schema(&home_url, "Correspondence log", description, language, latest);
    if !past.is_empty() {
        home_page["hasPart"] = json!({"@type":"WebPageElement","@id":format!("{home_url}#archive"),
            "name":"Past articles","mainEntity":{
                "@type":"ItemList","itemListOrder":"https://schema.org/ItemListOrderDescending",
                "numberOfItems":past.len(),
                "itemListElement":past.iter().enumerate().map(|(i, a)| json!({
                    "@type":"ListItem","position":i+1,"item":{"@type":"Article",
                        "@id":format!("{}#article",a.canonical),"name":a.meta.title,"url":a.canonical}
                })).collect::<Vec<_>>() }});
    }
    let mut graph = vec![website_schema(), home_page];
    if let Some(article) = latest {
        // Include the stable permalink page node so mainEntityOfPage resolves
        // even while the same article is featured at the rolling homepage.
        graph.push(page_schema(&article.canonical, &article.meta.title, &article.meta.description,
            &article.meta.language, Some(article)));
        graph.push(article_schema(article));
    }
    let homepage = json!({
        "article": latest, "past": past, "canonical": home_url, "page_type": "website",
        "page_title": "Correspondence log", "description": description, "language": language,
        "structured": script_json(&json!({"@context":"https://schema.org","@graph":graph}))?
    });
    pages.push((PathBuf::from("index.html"),
        env.get_template("homepage.html")?.render(TemplateValue::from_serialize(homepage))?));
    for article in articles {
        let context = json!({
            "article": article, "canonical": article.canonical, "page_type": "article",
            "page_title": article.meta.title, "description": article.meta.description, "language": article.meta.language,
            "structured": script_json(&json!({"@context":"https://schema.org","@graph":[
                website_schema(), page_schema(&article.canonical, &article.meta.title,
                    &article.meta.description, &article.meta.language, Some(article)), article_schema(article)]}))?
        });
        pages.push((PathBuf::from(format!("articles/{}/index.html", article.meta.slug)),
            env.get_template("article.html")?.render(TemplateValue::from_serialize(context))?));
    }
    pages.push((PathBuf::from("style.css"), include_str!("../assets/style.css").to_owned()));
    Ok(pages)
}

fn generate(parser: &Path, data: &Path, out: &Path) -> Result<()> {
    ensure!(!out.exists(), "output directory must not exist: {}", out.display());
    let articles = load_articles(parser, data)?;
    let pages = render_site(&articles)?;
    // Validate and render every page before writing any output. The caller builds
    // into a fresh staging directory and promotes only after success.
    fs::create_dir(out)?;
    for (path, content) in pages {
        let target = out.join(path);
        fs::create_dir_all(target.parent().context("output parent")?)?;
        fs::write(target, content)?;
    }
    println!("Generated {} article(s) and homepage", articles.len());
    Ok(())
}

fn main() -> Result<()> {
    let args: Vec<_> = env::args_os().skip(1).collect();
    ensure!(args.len() == 3, "usage: site-generator <markdown-parser> <articles-dir> <new-output-dir>");
    generate(Path::new(&args[0]), Path::new(&args[1]), Path::new(&args[2]))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn slug_and_timestamp_validation() {
        assert!(slug("letter-2026"));
        for s in ["../a", "A", "a--b", "-a", "a/", "a.b", ""] { assert!(!slug(s)); }
        assert!(timestamp("2026-11-24T01:21:26-08:00").is_ok());
        assert!(timestamp("2026-11-24T01:21:26").is_err());
    }
    #[test]
    fn written_zone_is_explicit_and_matches_offset() {
        let date = timestamp("2026-11-24T01:21:26-08:00").unwrap();
        assert_eq!(written_display(&date, Some("PST")).unwrap(), "November 24, 2026 · 01:21:26 PST");
        assert!(written_display(&date, Some("PDT")).is_err());
        assert!(written_display(&date, None).unwrap().ends_with("-08:00"));
    }
    #[test]
    fn json_ld_is_script_safe() {
        let original = json!({"title":"</script><script>alert(1)</script>&\u{2028}"});
        let encoded = script_json(&original).unwrap();
        assert!(!encoded.contains('<'));
        assert_eq!(serde_json::from_str::<Value>(&encoded).unwrap(), original);
    }
    #[test]
    fn empty_site_has_no_archive() {
        let pages = render_site(&[]).unwrap();
        assert!(!pages[0].1.contains("Past articles"));
    }
}
