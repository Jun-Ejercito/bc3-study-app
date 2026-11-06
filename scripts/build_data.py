#!/usr/bin/env python3
"""Build verified BC3 study-app data from local sources. Provenance logged."""
from __future__ import annotations
import json, re, sys, hashlib, zipfile
from pathlib import Path
from collections import defaultdict, OrderedDict
from datetime import datetime, timezone

ROOT = Path('/workspace/bc3-study-app')
OUT = ROOT / 'public' / 'data'
OUT.mkdir(parents=True, exist_ok=True)
IMG = ROOT / 'public' / 'img'
IMG.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, '/workspace/bc3')
sys.path.insert(0, '/workspace/days')
from data import R5後, R6前, R6後, R7前, R7後  # noqa: E402
import content as day_content  # noqa: E402
import groups as GRP  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_docx_text import docx_plain, has_debris  # noqa: E402

SET_META = OrderedDict([
    ('R5後', {
        'id': 'R5後', 'era': '令和5年度', 'term': '後期', 'label_ja': '令和5年度後期',
        'label_en': 'FY2023 Autumn (R5後)', 'file_q': 'f1.pdf', 'file_a': 'f2.pdf',
        'file_txt': 'f1.txt', 'questions': 40, 'pass_mark': 24, 'minutes': 110,
    }),
    ('R6前', {
        'id': 'R6前', 'era': '令和6年度', 'term': '前期', 'label_ja': '令和6年度前期',
        'label_en': 'FY2024 Spring (R6前)', 'file_q': 'f3.pdf', 'file_a': 'f4.pdf',
        'file_txt': 'f3.txt', 'questions': 40, 'pass_mark': 24, 'minutes': 110,
    }),
    ('R6後', {
        'id': 'R6後', 'era': '令和6年度', 'term': '後期', 'label_ja': '令和6年度後期',
        'label_en': 'FY2024 Autumn (R6後)', 'file_q': 'f5.pdf', 'file_a': 'f6.pdf',
        'file_txt': 'f5.txt', 'questions': 40, 'pass_mark': 24, 'minutes': 110,
    }),
    ('R7前', {
        'id': 'R7前', 'era': '令和7年度', 'term': '前期', 'label_ja': '令和7年度前期',
        'label_en': 'FY2025 Spring (R7前)', 'file_q': 'f7.pdf', 'file_a': 'f8.pdf',
        'file_txt': 'f7.txt', 'questions': 40, 'pass_mark': 24, 'minutes': 110,
    }),
    ('R7後', {
        'id': 'R7後', 'era': '令和7年度', 'term': '後期', 'label_ja': '令和7年度後期',
        'label_en': 'FY2025 Autumn (R7後)', 'file_q': 'f9.pdf', 'file_a': 'f10.pdf',
        'file_txt': 'f9.txt', 'questions': 40, 'pass_mark': 24, 'minutes': 110,
    }),
])

EN_MOD = {'R5後': R5後, 'R6前': R6前, 'R6後': R6後, 'R7前': R7前, 'R7後': R7後}
LETTER_EN = {'ア': 'A', 'イ': 'B', 'ウ': 'C', 'エ': 'D'}
EN_LETTER = {v: k for k, v in LETTER_EN.items()}

# Official answer key OCR for R6前 32-34 (from f4.pdf RapidOCR visual read 2026-11-06)
R6MAE_EXTRA = {
    32: 'ア', 33: 'エ', 34: 'エ',
}

REVIEW_DAYS = {7, 10, 22, 27, 30}
MOCK_DAYS = {28: 'R7前', 29: 'R7後'}

COMP = [
    ('先入先出', 'さきいれさきだし'), ('先入', 'さきいれ'), ('先出', 'さきだし'),
    ('示数', 'しすう'), ('経時', 'けいじ'), ('日本', 'にほん'), ('抜取', 'ぬきとり'),
    ('第一種', 'だいいっしゅ'),
]


def clean_eq_junk(s: str) -> str:
    s = re.sub(r'jc2\s*"Font:[^"]*"\s*hps\d+\s*\d+\([^)]*\),', '', s)
    s = re.sub(r'EQ\s*\\?\*?\s*', '', s)
    s = re.sub(r'\\[a-z]+\s*', '', s)
    s = re.sub(r'\*"Font:[^"]*"', '', s)
    s = re.sub(r'\* hps\d+', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def docx_text(path: Path) -> str:
    z = zipfile.ZipFile(path)
    xml = z.read('word/document.xml').decode('utf-8')
    xml = re.sub(r'<w:rt\b[^>]*>.*?</w:rt>', '', xml, flags=re.S)
    xml = re.sub(r'</w:p>', '\n', xml)
    text = re.sub(r'<[^>]+>', '', xml)
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    return text


def load_answers_from_d() -> dict:
    """Parse d_*.txt answer keys: #N [LETTER] stem..."""
    out = {}
    for sid in SET_META:
        p = Path(f'/workspace/bc3/d_{sid}.txt')
        text = p.read_text(encoding='utf-8')
        for m in re.finditer(r'^#(\d+)\s+\[([ア-エ])\]\s*(.*)$', text, re.M):
            no = int(m.group(1))
            out[f'{sid}-{no}'] = m.group(2)
        # fill gaps from official key OCR for R6前
        if sid == 'R6前':
            for no, let in R6MAE_EXTRA.items():
                out.setdefault(f'{sid}-{no}', let)
    return out


def extract_jp_explanations() -> dict:
    """From Day*_解説.docx; keys exam-no."""
    qs = {q['i']: q for q in json.load(open('/workspace/days/qs.json'))['qs']}
    final = {int(k): v for k, v in json.load(open('/workspace/days/final.json'))['final'].items()}
    out = {}
    for d in range(1, 31):
        p = Path(f'/workspace/days/out/Day{d:02d}_解説.docx')
        if not p.exists():
            continue
        text = docx_plain(str(p))
        parts = re.split(r'問題\s*(\d+)', text)
        bodies = {}
        for i in range(1, len(parts), 2):
            num = int(parts[i])
            body = parts[i + 1]
            m = re.search(r'正解\s*([ア-エ])', body)
            em = re.search(r'解説\s*(.+?)(?=問題\s*\d+|思い出し|$)', body, re.S)
            letter = m.group(1) if m else None
            expl = re.sub(r'\s+', ' ', (em.group(1).strip() if em else '')).strip()
            if has_debris(expl):
                raise RuntimeError('debris in Day %d Q%d' % (d, num))
            bodies[num] = (letter, expl)
        for k, qi in enumerate(final.get(d, []), 1):
            q = qs[qi]
            key = f"{q['exam']}-{q['no']}"
            if k in bodies and bodies[k][0]:
                out[key] = {'letter': bodies[k][0], 'explanation_jp': bodies[k][1], 'day': d, 'internal_id': qi}
    return out


def parse_yoten() -> dict:
    """Parse /workspace/bc3/jp/c/*.txt into section dict keyed by A1-1-1 etc."""
    sections = {}
    for p in sorted(Path('/workspace/bc3/jp/c').glob('*.txt')):
        text = p.read_text(encoding='utf-8', errors='replace')
        chunks = re.split(r'@([AB]\d-\d-\d)', text)
        for i in range(1, len(chunks), 2):
            sid = chunks[i]
            body = chunks[i + 1].strip()
            title = ''
            tm = re.match(r'##\s*\(.*?\)\s*(.+)', body)
            if tm:
                title = tm.group(1).strip().split('\n')[0]
            # bullets and warnings
            lines = []
            warnings = []
            for line in body.splitlines():
                line = line.strip()
                if not line or line.startswith('##') or line.startswith('|'):
                    continue
                if line.startswith('!'):
                    warnings.append(line[1:].strip())
                elif line.startswith('-') or line.startswith('・'):
                    lines.append(line.lstrip('-・').strip())
            sections[sid] = {
                'id': sid, 'title': title, 'bullets': lines[:40], 'warnings': warnings,
                'source_file': p.name,
            }
    return sections


def day_banner_map() -> dict:
    info = json.load(open('/workspace/days/info.json'))
    kou = json.load(open('/workspace/days/kou.json'))
    out = {}
    for d, bi in kou['banners'].items():
        t = info[bi]['t'] if bi < len(info) else ''
        t = re.sub(r'^Day\s*\d+\s*', '', t)
        t = t.replace('今日の範囲：', '').replace('復習日', '復習：')
        t = re.sub(r'（第\d章のミニテスト[^）]*）', '', t)
        t = re.sub(r'（第\d章のミニテスト[^）]*を含む）', '', t)
        out[int(d)] = t.strip('　 ')
    return out


def map_day_to_sections(banners: dict, yoten: dict) -> dict:
    """Best-effort: match section ids mentioned in banner text like 共通1-1-1 / 専門2-4-3."""
    day_secs = {}
    for d, ban in banners.items():
        found = []
        # 共通N-N-N or 専門N-N-N
        for m in re.finditer(r'(共通|専門)(\d)-(\d)-(\d)', ban):
            prefix = 'A' if m.group(1) == '共通' else 'B'
            sid = f'{prefix}{m.group(2)}-{m.group(3)}-{m.group(4)}'
            if sid in yoten:
                found.append(sid)
        # ranges 共通1-1-1〜共通1-2-2
        for m in re.finditer(r'(共通|専門)(\d)-(\d)-(\d)\s*[〜～~]\s*(共通|専門)(\d)-(\d)-(\d)', ban):
            # already captured ends; expand if same chapter
            pass
        day_secs[d] = found
    return day_secs


def load_rdict() -> dict:
    return json.load(open('/workspace/days/rdict.json'))


def build_questions(answers: dict, expl_jp: dict, refs: dict) -> list:
    qs2 = json.load(open('/workspace/bc3/qs2.json'))
    days_qs = {q['i']: q for q in json.load(open('/workspace/days/qs.json'))['qs']}
    final = {int(k): v for k, v in json.load(open('/workspace/days/final.json'))['final'].items()}
    src = {int(k): int(v) for k, v in json.load(open('/workspace/days/final.json'))['src'].items()}

    # reverse: exam-no -> internal id and day
    by_exam = {}
    for qi, q in days_qs.items():
        by_exam[f"{q['exam']}-{q['no']}"] = q

    questions = []
    gaps = []
    for sid, meta in SET_META.items():
        for no in range(1, 41):
            key = f'{sid}-{no}'
            qtext = qs2[sid].get(str(no))
            if not qtext:
                gaps.append({'id': key, 'gap': 'missing_stem_in_qs2'})
                continue
            letter = answers.get(key)
            if not letter:
                gaps.append({'id': key, 'gap': 'missing_answer'})
                continue
            en = EN_MOD[sid].D.get(no)
            cat, topic, en_ex = (en if en else (None, None, None))
            jp = expl_jp.get(key, {})
            dq = by_exam.get(key)
            ref = refs.get(key)
            # letter consistency: EN module uses A-D sometimes in older; d_*.txt uses ア-エ
            needs_image = bool(re.search(
                r'次の図|下図|右の図|左の図|下の図|上記の図|次の表|下表|部門別配賦表|次のデータ|次の資料|＜.+＞',
                qtext['stem'] + ''.join(qtext.get('ch', {}).values())
            ))
            qid = f'{sid}-{no}'
            questions.append({
                'id': qid,
                'set': sid,
                'no': no,
                'page': qtext.get('page'),
                'stem': qtext['stem'].replace('\n', ''),
                'choices': qtext['ch'],
                'answer': letter,
                'answer_en': LETTER_EN[letter],
                'explanation_jp': jp.get('explanation_jp') or '',
                'explanation_en': en_ex or '',
                'category': cat or (ref[0] if ref and isinstance(ref[0], str) and len(ref[0]) == 1 else None) and None,
                'topic': topic or '',
                'category_ja': cat or '',
                'day': src.get(dq['i']) if dq else (jp.get('day')),
                'internal_id': dq['i'] if dq else jp.get('internal_id'),
                'part': dq.get('part') if dq else None,
                'chap': dq.get('chap') if dq else None,
                'sec': dq.get('sec') if dq else None,
                'kou': dq.get('kou') if dq else None,
                'heading': dq.get('h') if dq else None,
                'ref': {
                    'part': ref[1] if ref else None,
                    'chap': ref[2] if ref else None,
                    'page': ref[3] if ref else None,
                    'text': ref[4] if ref else None,
                } if ref else None,
                'needs_image': needs_image,
                'image': None,  # filled later if crop exists
                'authored': False,  # all five sets are real exams
                'provenance': {
                    'stem_source': f"/workspace/bc3/qs2.json → {sid}/{no}",
                    'answer_source': (
                        f"/workspace/bc3/d_{sid}.txt" if key in answers and no not in R6MAE_EXTRA or sid != 'R6前'
                        else '/workspace/exams/f4.pdf (official 正解表 OCR/visual 2026-11-06)'
                        if sid == 'R6前' and no in R6MAE_EXTRA
                        else f"/workspace/bc3/d_{sid}.txt"
                    ),
                    'explanation_jp_source': '/workspace/days/out/Day*_解説.docx' if jp.get('explanation_jp') else None,
                    'explanation_en_source': f'/workspace/bc3/data/{sid}.py' if en_ex else None,
                },
            })
            # fix answer_source more carefully
            if sid == 'R6前' and no in R6MAE_EXTRA:
                questions[-1]['provenance']['answer_source'] = '/workspace/exams/f4.pdf (official 正解表 visual read 2026-11-06)'
            else:
                questions[-1]['provenance']['answer_source'] = f'/workspace/bc3/d_{sid}.txt'
            # category from EN
            if cat:
                questions[-1]['category_ja'] = cat
    return questions, gaps


def assign_clusters(questions: list) -> list:
    """Map each question to equivalence cluster via groups.G topic rules."""
    # Build topic -> cluster name
    topic_to_cluster = []
    for cat, rules in GRP.G.items():
        for cname, keys in rules:
            topic_to_cluster.append((cat, cname, keys))
    clusters = OrderedDict()
    for q in questions:
        topic = q.get('topic') or ''
        cat = q.get('category_ja') or ''
        matched = None
        for ccat, cname, keys in topic_to_cluster:
            if cat and ccat != cat:
                continue
            if any(k in topic for k in keys):
                matched = f'{ccat}::{cname}'
                break
        if not matched:
            matched = f"{cat or '未分類'}::{topic or 'その他'}"
        q['cluster'] = matched
        clusters.setdefault(matched, {
            'id': matched, 'category': cat, 'name': matched.split('::', 1)[-1],
            'question_ids': [],
        })['question_ids'].append(q['id'])
    return list(clusters.values())


def build_flashcards(questions: list, yoten: dict) -> list:
    """Flashcards from day recall activities + key warnings. Multiple-answer capable."""
    cards = []
    cid = 0
    C = day_content.C
    for day, data in sorted(C.items()):
        theme = data.get('theme', '')
        # web / classification
        if data.get('web'):
            center, branches = data['web']
            cid += 1
            cards.append({
                'id': f'fc-{cid:04d}',
                'type': 'multi_recall',
                'day': day,
                'concept': center,
                'prompt_ja': f'「{center}」に含まれる項目をすべて挙げよう。',
                'prompt_en': f'List all items under 「{center}」.',
                'answer_ja': '・'.join(a for a, _ in branches),
                'answer_parts': [a for a, _ in branches],
                'hints': [h for _, h in branches],
                'source': f'content.py C[{day}].web',
                'variant_group': f'web-{day}-{center}',
            })
        for prompt, answer in data.get('recall', []):
            cid += 1
            cards.append({
                'id': f'fc-{cid:04d}',
                'type': 'multi_recall',
                'day': day,
                'concept': theme,
                'prompt_ja': prompt,
                'prompt_en': prompt,
                'answer_ja': answer,
                'answer_parts': re.split(r'[・/／、]', answer),
                'hints': [],
                'source': f'content.py C[{day}].recall',
                'variant_group': f'recall-{day}-{prompt[:20]}',
            })
        for sentence in data.get('cloze', []):
            blanks = re.findall(r'\{([^}]+)\}', sentence)
            shown = re.sub(r'\{([^}]+)\}', '（　）', sentence)
            cid += 1
            cards.append({
                'id': f'fc-{cid:04d}',
                'type': 'cloze',
                'day': day,
                'concept': theme,
                'prompt_ja': shown,
                'prompt_en': shown,
                'answer_ja': '・'.join(blanks),
                'answer_parts': blanks,
                'hints': [],
                'source': f'content.py C[{day}].cloze',
                'variant_group': f'cloze-{day}-{shown[:24]}',
            })
        for stmt, ox, expl in data.get('ox', []):
            cid += 1
            cards.append({
                'id': f'fc-{cid:04d}',
                'type': 'ox',
                'day': day,
                'concept': theme,
                'prompt_ja': stmt,
                'prompt_en': stmt,
                'answer_ja': ox,
                'answer_parts': [ox],
                'hints': [expl],
                'explanation_ja': expl,
                'source': f'content.py C[{day}].ox',
                'variant_group': f'ox-{day}-{stmt[:20]}',
            })
    # Definition cards from yoten warnings (exam-tested traps)
    for sid, sec in yoten.items():
        for w in sec.get('warnings', []):
            cid += 1
            cards.append({
                'id': f'fc-{cid:04d}',
                'type': 'definition',
                'day': None,
                'concept': sec.get('title') or sid,
                'prompt_ja': f'次のひっかけポイントを説明せよ：{sec.get("title") or sid}',
                'prompt_en': 'Explain this exam trap point.',
                'answer_ja': w,
                'answer_parts': [w],
                'hints': [],
                'section': sid,
                'source': f'jp/c/{sec["source_file"]} @{sid}',
                'variant_group': f'warn-{sid}',
            })
    return cards


def build_days(banners, day_secs, yoten, questions, cards) -> list:
    final = {int(k): v for k, v in json.load(open('/workspace/days/final.json'))['final'].items()}
    q_by_internal = {q['internal_id']: q for q in questions if q.get('internal_id')}
    C = day_content.C
    days = []
    for d in range(1, 31):
        qids = []
        for qi in final.get(d, []):
            q = q_by_internal.get(qi)
            if q:
                qids.append(q['id'])
        secs = day_secs.get(d, [])
        yoten_blocks = [yoten[s] for s in secs if s in yoten]
        kind = 'mock' if d in MOCK_DAYS else ('review' if d in REVIEW_DAYS else 'lesson')
        mock_set = MOCK_DAYS.get(d)
        if mock_set:
            qids = [q['id'] for q in questions if q['set'] == mock_set]
        days.append({
            'day': d,
            'id': f'Day{d:02d}',
            'kind': kind,
            'banner': banners.get(d, ''),
            'theme': C.get(d, {}).get('theme', ''),
            'yoten_section_ids': secs,
            'yoten': yoten_blocks,
            'yoten_coverage': 'sections' if yoten_blocks else ('none' if kind == 'lesson' else 'n/a'),
            'question_ids': qids,
            'card_ids': [c['id'] for c in cards if c.get('day') == d],
            'recall': C.get(d),
            'mock_set': mock_set,
            'lesson_docx': f'/workspace/days/out/Day{d:02d}_レッスン.docx',
            'kakomon_docx': f'/workspace/days/out/Day{d:02d}_過去問.docx',
            'omoidashi_docx': f'/workspace/days/out/Day{d:02d}_思い出しワーク.docx',
            'kaisetsu_docx': f'/workspace/days/out/Day{d:02d}_解説.docx',
        })
    return days


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()[:16]


def main():
    print('Loading answers...')
    answers = load_answers_from_d()
    print(f'  answers: {len(answers)}')
    print('Extracting JP explanations from Day 解説...')
    expl_jp = extract_jp_explanations()
    print(f'  jp explanations: {len(expl_jp)}')
    refs = json.load(open('/workspace/bc3/refs.json'))
    print('Building questions...')
    questions, gaps = build_questions(answers, expl_jp, refs)
    print(f'  questions: {len(questions)} gaps: {len(gaps)}')
    # Fix categories: EN module has them
    for q in questions:
        en = EN_MOD[q['set']].D.get(q['no'])
        if en:
            q['category_ja'], q['topic'], _ = en[0], en[1], en[2]
            if not q['explanation_en']:
                q['explanation_en'] = en[2]

    clusters = assign_clusters(questions)
    print(f'  clusters: {len(clusters)}')

    print('Parsing 要点...')
    yoten = parse_yoten()
    banners = day_banner_map()
    day_secs = map_day_to_sections(banners, yoten)
    # Expand section ranges for days: include all sections between first and last if same part
    # Simple: for each day, if we found endpoints, also include intermediate from yoten keys sorted
    all_sec_ids = sorted(yoten.keys(), key=lambda s: (s[0], int(s[1]), int(s[3]), int(s[5])))
    for d, secs in list(day_secs.items()):
        if len(secs) >= 2:
            try:
                i0 = all_sec_ids.index(secs[0])
                i1 = all_sec_ids.index(secs[-1])
                if i1 >= i0:
                    day_secs[d] = all_sec_ids[i0:i1 + 1]
            except ValueError:
                pass

    print('Building flashcards...')
    cards = build_flashcards(questions, yoten)
    print(f'  cards: {len(cards)}')

    print('Building days...')
    days = build_days(banners, day_secs, yoten, questions, cards)

    # Furigana dict (reviewed overrides + rdict)
    rdict = load_rdict()
    for kan, yomi in COMP:
        rdict[kan] = yomi

    # Integrity checks
    ids = [q['id'] for q in questions]
    assert len(ids) == len(set(ids)), 'duplicate question ids'
    by_set = defaultdict(int)
    for q in questions:
        by_set[q['set']] += 1
    assert sum(by_set.values()) == len(questions)
    missing_ans = [q['id'] for q in questions if not q['answer']]
    missing_day = [q['id'] for q in questions if q['day'] is None and q['set'] not in ('R7前', 'R7後')]
    # All 200 mapped in final.json except mocks are also mapped via day 28/29
    mapped = sum(1 for q in questions if q['day'] is not None)
    jp_expl = sum(1 for q in questions if q['explanation_jp'])
    en_expl = sum(1 for q in questions if q['explanation_en'])
    img_needed = [q['id'] for q in questions if q['needs_image']]

    checks = {
        'unique_question_ids': len(ids) == len(set(ids)),
        'question_count': len(questions),
        'expected_count': 200,
        'per_set': dict(by_set),
        'answers_present': len(missing_ans) == 0,
        'missing_answers': missing_ans,
        'with_day_mapping': mapped,
        'with_jp_explanation': jp_expl,
        'with_en_explanation': en_expl,
        'needs_image_flagged': img_needed,
        'image_crops_available': [],
        'flashcard_count': len(cards),
        'cluster_count': len(clusters),
        'days_with_yoten': sum(1 for d in days if d['yoten']),
        'gaps': gaps,
        'r6mae_32_34_answer_source': 'official 正解表 f4.pdf visual read',
        'r6mae_32_34_answers': R6MAE_EXTRA,
    }

    manifest = {
        'built_at': datetime.now(timezone.utc).astimezone().isoformat(),
        'timezone_note': 'Asia/Tokyo',
        'scope': 'Five official BC3 生産管理オペレーション 3級 exams only (R5後/R6前/R6後/R7前/R7後) = 200 questions.',
        'sets': list(SET_META.values()),
        'sources': {
            'questions_text': '/workspace/bc3/qs2.json (from /workspace/exams/f1,f3,f5,f7,f9.txt + PDFs)',
            'answers': '/workspace/bc3/d_*.txt plus R6前-32/33/34 from /workspace/exams/f4.pdf 正解表',
            'explanations_jp': '/workspace/days/out/DayNN_解説.docx',
            'explanations_en': '/workspace/bc3/data/{set}.py',
            'day_mapping': '/workspace/days/final.json + qs.json',
            'recall_activities': '/workspace/days/content.py',
            'yoten': '/workspace/bc3/jp/c/*.txt',
            'clusters': '/workspace/bc3/groups.py',
            'furigana': '/workspace/days/rdict.json + COMP overrides in days/lib.py',
            'lesson_docs': '/workspace/days/out/DayNN_*.docx',
            'source_books': ['/workspace/bc_source.pdf', '/workspace/bc_source2.pdf'],
        },
        'hashes': {
            'qs2.json': sha(Path('/workspace/bc3/qs2.json')),
            'final.json': sha(Path('/workspace/days/final.json')),
            'content.py': sha(Path('/workspace/days/content.py')),
        },
        'checks': checks,
        'limitations': [
            'Question diagram/table image crops are NOT fully generated in v1; needs_image flags list candidates. Text stem+choices are always present.',
            'Furigana uses reviewed dictionary + compound overrides; auto longest-match is not claimed flawless.',
            '要点 section mapping to days is derived from Day banner ranges; review days / mock days have no new 要点.',
            'R6前 questions 32–34 answers taken from official 正解表 (f4.pdf) because d_R6前.txt OCR missed them; JP explanations for those three come from Day 解説 when mapped, else English module.',
            'No cloud sync. Progress is localStorage only; export/import JSON for backup.',
            'Constraint t44u (figures on pages 1–24 of lesson docx) does not apply to this web app; lesson figures reused only when copied as assets.',
        ],
    }

    # Write outputs
    (OUT / 'sets.json').write_text(json.dumps(list(SET_META.values()), ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'questions.json').write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'days.json').write_text(json.dumps(days, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'flashcards.json').write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'clusters.json').write_text(json.dumps(clusters, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'furigana.json').write_text(json.dumps(rdict, ensure_ascii=False), encoding='utf-8')
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'yoten_sections.json').write_text(json.dumps(yoten, ensure_ascii=False, indent=2), encoding='utf-8')

    print('DONE')
    print(json.dumps(checks, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
