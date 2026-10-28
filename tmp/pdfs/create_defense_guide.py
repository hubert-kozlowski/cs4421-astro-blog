from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    PageBreak,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT = "output/pdf/gridiron-atlas-defense-drill-guide.pdf"


def paragraph(text, style):
    return Paragraph(text, style)


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#c9293a"))
    canvas.setLineWidth(2)
    canvas.line(18 * mm, 285 * mm, 192 * mm, 285 * mm)
    canvas.setFillColor(colors.HexColor("#17233b"))
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(18 * mm, 289 * mm, "GRIDIRON ATLAS  |  DEFENSE DRILL")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#6f7480"))
    canvas.drawRightString(192 * mm, 12 * mm, f"CS4421 - page {doc.page}")
    canvas.restoreState()


def section(title, body, styles):
    return KeepTogether([
        Spacer(1, 4 * mm),
        paragraph(title, styles["Section"]),
        paragraph(body, styles["Body"]),
    ])


def build():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="TitleCustom", parent=styles["Title"], fontName="Helvetica-Bold",
        fontSize=24, leading=28, textColor=colors.HexColor("#17233b"), spaceAfter=5 * mm,
    ))
    styles.add(ParagraphStyle(
        name="Subtitle", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=10.5, leading=15, textColor=colors.HexColor("#586174"), spaceAfter=7 * mm,
    ))
    styles.add(ParagraphStyle(
        name="Section", parent=styles["Heading2"], fontName="Helvetica-Bold",
        fontSize=14, leading=18, textColor=colors.HexColor("#17233b"), spaceBefore=3 * mm, spaceAfter=2 * mm,
    ))
    styles.add(ParagraphStyle(
        name="Body", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=9.3, leading=13.2, textColor=colors.HexColor("#252b37"), spaceAfter=2.5 * mm,
    ))
    styles.add(ParagraphStyle(
        name="Small", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=8.4, leading=11.5, textColor=colors.HexColor("#252b37"),
    ))
    styles.add(ParagraphStyle(
        name="CodeBlock", parent=styles["BodyText"], fontName="Courier",
        fontSize=7.8, leading=10.2, textColor=colors.HexColor("#17233b"),
        backColor=colors.HexColor("#f1f4f8"), leftIndent=3 * mm, rightIndent=3 * mm,
        borderPadding=2.5 * mm, spaceBefore=1 * mm, spaceAfter=3 * mm,
    ))

    doc = BaseDocTemplate(
        OUTPUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=20 * mm, bottomMargin=18 * mm,
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height - 4 * mm, id="content")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=header_footer, onPageEnd=header_footer)])

    story = [
        paragraph("Project Defense Drill", styles["TitleCustom"]),
        paragraph("Gridiron Atlas - a focused 3-5 minute runbook and speaking guide", styles["Subtitle"]),
        section("One-sentence architecture", "Gridiron Atlas is an Astro 7 server-rendered NFL dashboard packaged with the Node standalone adapter in a Docker image, deployed as an ECS Fargate service behind an Application Load Balancer and CloudFront.", styles),
        section("Your 30-second opening", "“The application is an SSR Astro service because it needs same-origin dynamic API routes and server-side provider normalization. The load balancer checks <b>/api/ready</b>, the container checks <b>/api/health</b>, and ECS uses a rolling deployment with a circuit breaker. That lets a healthy old task continue serving traffic while a new task proves readiness.”", styles),
        paragraph("Defense sequence", styles["Section"]),
        Table([
            [paragraph("Time", styles["Small"]), paragraph("Say / show", styles["Small"])],
            [paragraph("0:00", styles["Small"]), paragraph("Show the deployed app and identify the GitHub PR / commit that introduced the fault.", styles["Small"])],
            [paragraph("0:30", styles["Small"]), paragraph("Open GitHub Actions or CloudWatch logs. State the failing path, status, and source line; do not guess.", styles["Small"])],
            [paragraph("1:00", styles["Small"]), paragraph("Show that /api/health and /api/ready are 200. Explain that this contains the user-facing fault without taking the service out of rotation.", styles["Small"])],
            [paragraph("1:30", styles["Small"]), paragraph("Merge the rollback PR (or show its completed deploy). Verify the bad URL is gone and health remains 200.", styles["Small"])],
            [paragraph("2:30", styles["Small"]), paragraph("Defend SSR, health probes, rolling deployment, SLI/SLO, and circuit breaker choices.", styles["Small"])],
        ], colWidths=[22 * mm, 134 * mm], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17233b")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d8dde6")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f9fc")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ])),
        PageBreak(),
        Spacer(1, 12 * mm),
        paragraph("Fault and rollback evidence", styles["TitleCustom"]),
        section("Planned fault", "The demonstration release adds an NFL / CFB switcher. Selecting CFB reaches a provider path that has not been configured and returns an application-level 500. The ordinary NFL path remains available. This is intentionally narrow: it demonstrates a real bad release signal without making the platform unavailable.", styles),
        section("What to show in logs", "Filter the ECS CloudWatch log stream by the request ID or the CFB request. The application emits structured JSON through Astro middleware. The expected record is <b>path: /</b>, <b>status: 500</b>, and <b>error: Error</b>; the stack trace identifies <b>src/pages/index.astro:30</b> with “CFB data provider is not configured.” Explain that this is the root cause, not merely a symptom.", styles),
        section("Proof of availability", "The local rehearsal produced 200 from <b>/api/ready</b> and <b>/api/health</b>, while <b>/?sport=cfb</b> produced 500. In production, re-run those requests before and after rollback. A successful readiness response is the deployment gate; it does not mean every feature path is correct, which is why the error logs and release verification matter.", styles),
        paragraph("Useful commands", styles["Section"]),
        paragraph("curl -i https://gridironatlas.app/api/ready\ncurl -i https://gridironatlas.app/api/health\ncurl -i 'https://gridironatlas.app/?sport=cfb'\ngh run list --workflow 'Deploy Astro SSR Container via AWS CDK' --limit 5", styles["CodeBlock"]),
        section("Rollback story", "The rollback is a small, separate PR that removes the selector and the failing CFB path. Merging it triggers the same CI and CDK pipeline. ECS starts replacement tasks, waits for the ALB readiness check at <b>/api/ready</b>, keeps the old task healthy during the transition (minimum healthy 100%, maximum healthy 200%), then removes the old task. ECS deployment circuit breaker is enabled, so a failed replacement reverts automatically rather than draining the healthy version.", styles),
        PageBreak(),
        paragraph("Architecture and DevOps answers", styles["TitleCustom"]),
        section("Why SSR rather than static SSG?", "Static S3/CloudFront is excellent for immutable pages: lower operational cost, simple caching, and no server runtime. This project needs dynamic same-origin endpoints such as health, readiness, metrics, live data, and provider-backed pages. Containerized SSR keeps provider credentials and normalization server-side, enables operational endpoints, and supports dynamic data. The trade-off is container, load-balancer, observability, and deployment complexity.", styles),
        section("What are the health probes?", "The Docker container health check calls <b>http://127.0.0.1:4321/api/health</b> every 30 seconds with a 5-second timeout, 3 retries, and a 30-second start period. The ALB target group checks <b>/api/ready</b> and only routes to HTTP 200 targets. Liveness answers “is the process alive?”; readiness answers “should this task receive traffic?”", styles),
        section("How do you achieve no/minimal downtime?", "ECS rolling deployment is configured with <b>minHealthyPercent: 100</b> and <b>maxHealthyPercent: 200</b>. ECS can start a replacement before stopping the previous task, and the ALB routes only after readiness succeeds. With desired count 1, this is the critical configuration that avoids a planned gap during a healthy deployment. It is still honest to say no system can promise literal zero interruption for every failure mode; the evidence is continuous 200 health/readiness checks and deployment events.", styles),
        section("SLI, SLO, and error budget", "An SLI is a measured indicator, for example successful ALB requests / total ALB requests, or latency at p95. An SLO is the target, such as 99.9% successful requests over 30 days or p95 below an agreed threshold. An error budget is the allowed failure portion: at 99.9%, the budget is 0.1%. This project exposes request/error/latency metrics, has CloudWatch alarms for target 5xx, error logs, CPU, and memory, and records structured request logs.", styles),
        section("Why not simply hot-fix production?", "A PR-driven rollback leaves an auditable commit, code review record, CI result, deployment record, and a clear before/after narrative. If immediate service restoration were required, rolling ECS back to the prior known-good task definition/image is faster; follow with a source-control revert so deployed state and repository history match.", styles),
        section("SSL / browser trust setup", "Use AWS Certificate Manager (ACM), not a certificate file bought from a registrar. This project already declares a DNS-validated ACM certificate in <b>us-east-1</b> for <b>gridironatlas.app</b> and <b>www.gridironatlas.app</b>; CloudFront presents it to visitors. Deploy <b>GridironAtlasCertificateStack</b>, then copy every ACM validation CNAME exactly into Name.com. Do not delete those CNAMEs: ACM uses them for automatic renewal. Wait until ACM says <b>ISSUED</b>, deploy <b>CdkStack</b>, then point Name.com ANAME records for <b>@</b> and <b>www</b> to the returned CloudFront domain. Never point the public domain at the ECS load balancer. After DNS propagates, check both HTTPS health URLs; the browser should show a valid lock when the hostname, CloudFront alternate domain, and ACM certificate all match.", styles),
        paragraph("cd cdk && npx cdk deploy GridironAtlasCertificateStack --require-approval never\naws acm describe-certificate --region us-east-1 --certificate-arn <arn> --query 'Certificate.Status' --output text\n# At Name.com: add ACM CNAME validation records, then ANAME @ and www -> CloudFrontDomainName\ncurl --fail --location https://gridironatlas.app/api/health\ncurl --fail --location https://www.gridironatlas.app/api/health", styles["CodeBlock"]),
        paragraph("Pre-defense checklist", styles["Section"]),
        paragraph("1. Have PR links, commit SHAs, GitHub Actions, and CloudWatch open in tabs.  2. Know the public URL and the two health URLs.  3. Keep one terminal ready for curl commands.  4. State the exact failing line before proposing rollback.  5. After rollback deployment, repeat the three requests and capture the 200 evidence.  6. Be precise: this is a contained user-path failure, while platform health stayed available.", styles["Body"]),
    ]
    doc.build(story)


if __name__ == "__main__":
    build()
