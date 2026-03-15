/* ============================================================
   app.js — Journal Rankings & FSB Points Calculator
   Modules: DataStore, FuzzySearch, Autocomplete, WorkingList
   ============================================================ */

(function () {
    'use strict';

    // -------------------------------------------------------
    // DataStore — loads and caches journals.json
    // -------------------------------------------------------
    const DataStore = {
        journals: [],
        ready: false,

        async load() {
            try {
                const resp = await fetch('journals.json');
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                this.journals = await resp.json();
                this.ready = true;
                console.log(`Loaded ${this.journals.length} journals`);
            } catch (err) {
                console.error('Failed to load journal data:', err);
                this.journals = [];
            }
        },
    };

    // -------------------------------------------------------
    // FuzzySearch — lightweight fuzzy matching engine
    // Uses bigram similarity + substring bonus scoring
    // -------------------------------------------------------
    const FuzzySearch = {

        /** Produce bigrams from a string */
        bigrams(str) {
            const bg = new Set();
            const s = str.toLowerCase();
            for (let i = 0; i < s.length - 1; i++) {
                bg.add(s.slice(i, i + 2));
            }
            return bg;
        },

        /** Dice coefficient between two bigram sets */
        dice(a, b) {
            if (a.size === 0 && b.size === 0) return 1;
            if (a.size === 0 || b.size === 0) return 0;
            let intersection = 0;
            for (const bg of a) {
                if (b.has(bg)) intersection++;
            }
            return (2 * intersection) / (a.size + b.size);
        },

        /**
         * Score a journal title against a query.
         * Returns a number 0–1 (higher = better match).
         */
        score(title, query) {
            const tLow = title.toLowerCase();
            const qLow = query.toLowerCase().trim();
            if (!qLow) return 0;

            // Exact substring match → high bonus
            if (tLow.includes(qLow)) {
                // Starts-with is best
                if (tLow.startsWith(qLow)) return 1.0;
                // Word-boundary match
                if (tLow.includes(' ' + qLow)) return 0.95;
                return 0.9;
            }

            // Multi-word: every query word should appear somewhere
            const qWords = qLow.split(/\s+/);
            const allWordsFound = qWords.every(w => tLow.includes(w));
            if (allWordsFound) {
                return 0.85;
            }

            // Partial word matching — score each query word
            const tWords = tLow.split(/\s+/);
            let wordScore = 0;
            for (const qw of qWords) {
                let bestWord = 0;
                for (const tw of tWords) {
                    if (tw.startsWith(qw)) {
                        bestWord = Math.max(bestWord, 0.8);
                    } else if (tw.includes(qw)) {
                        bestWord = Math.max(bestWord, 0.6);
                    } else {
                        // Bigram similarity for fuzzy
                        const d = this.dice(this.bigrams(qw), this.bigrams(tw));
                        if (d > 0.4) bestWord = Math.max(bestWord, d * 0.7);
                    }
                }
                wordScore += bestWord;
            }
            const avgWordScore = wordScore / qWords.length;
            if (avgWordScore > 0.3) return avgWordScore * 0.8;

            // Fallback: full-string bigram similarity
            const d = this.dice(this.bigrams(qLow), this.bigrams(tLow));
            return d * 0.6;
        },

        /**
         * Search journals and return top N matches above threshold.
         */
        search(journals, query, limit = 8, threshold = 0.25) {
            if (!query.trim()) return [];
            const scored = [];
            for (const j of journals) {
                const s = this.score(j.title, query);
                if (s >= threshold) {
                    scored.push({ journal: j, score: s });
                }
            }
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, limit);
        },
    };

    // -------------------------------------------------------
    // Autocomplete — dropdown UI
    // -------------------------------------------------------
    const Autocomplete = {
        inputEl: null,
        listEl: null,
        clearBtn: null,
        activeIndex: -1,
        results: [],
        debounceTimer: null,

        init() {
            this.inputEl = document.getElementById('journal-search');
            this.listEl = document.getElementById('autocomplete-list');
            this.clearBtn = document.getElementById('clear-search');

            this.inputEl.addEventListener('input', () => this.onInput());
            this.inputEl.addEventListener('keydown', (e) => this.onKeydown(e));
            this.inputEl.addEventListener('focus', () => {
                if (this.results.length) this.open();
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.search-wrapper')) this.close();
            });
            this.clearBtn.addEventListener('click', () => {
                this.inputEl.value = '';
                this.clearBtn.style.display = 'none';
                this.close();
                JournalCard.hide();
                NoMatch.hide();
                this.inputEl.focus();
            });
        },

        onInput() {
            clearTimeout(this.debounceTimer);
            const q = this.inputEl.value;
            this.clearBtn.style.display = q ? 'flex' : 'none';

            this.debounceTimer = setTimeout(() => {
                this.results = FuzzySearch.search(DataStore.journals, q);
                this.activeIndex = -1;
                if (q.trim().length === 0) {
                    this.close();
                    JournalCard.hide();
                    NoMatch.hide();
                } else if (this.results.length > 0) {
                    this.render();
                    this.open();
                    NoMatch.hide();
                } else {
                    this.close();
                    JournalCard.hide();
                    NoMatch.show();
                }
            }, 120);
        },

        onKeydown(e) {
            if (!this.listEl.classList.contains('open')) return;
            const items = this.listEl.querySelectorAll('.autocomplete-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.activeIndex = Math.min(this.activeIndex + 1, items.length - 1);
                this.highlightActive(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.activeIndex = Math.max(this.activeIndex - 1, 0);
                this.highlightActive(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (this.activeIndex >= 0 && this.activeIndex < this.results.length) {
                    this.select(this.results[this.activeIndex].journal);
                }
            } else if (e.key === 'Escape') {
                this.close();
            }
        },

        highlightActive(items) {
            items.forEach((el, i) => el.classList.toggle('active', i === this.activeIndex));
            if (items[this.activeIndex]) {
                items[this.activeIndex].scrollIntoView({ block: 'nearest' });
            }
        },

        render() {
            const q = this.inputEl.value.toLowerCase();
            this.listEl.innerHTML = this.results.map((r, i) => {
                const j = r.journal;
                const highlighted = this.highlightTitle(j.title, q);
                return `
                    <div class="autocomplete-item" data-index="${i}" role="option">
                        <span class="ac-title">${highlighted}</span>
                        <span class="ac-badges">
                            ${j.abdc ? `<span class="ac-badge abdc">${j.abdc}</span>` : ''}
                            ${j.ajg ? `<span class="ac-badge ajg">${j.ajg}</span>` : ''}
                        </span>
                    </div>
                `;
            }).join('');

            this.listEl.querySelectorAll('.autocomplete-item').forEach(el => {
                el.addEventListener('click', () => {
                    const idx = parseInt(el.dataset.index);
                    this.select(this.results[idx].journal);
                });
            });
        },

        highlightTitle(title, query) {
            if (!query) return this.esc(title);
            // Highlight each query word in the title
            const words = query.split(/\s+/).filter(Boolean);
            let result = this.esc(title);
            for (const w of words) {
                const regex = new RegExp(`(${this.escRegex(w)})`, 'gi');
                result = result.replace(regex, '<mark>$1</mark>');
            }
            return result;
        },

        esc(s) {
            const d = document.createElement('div');
            d.textContent = s;
            return d.innerHTML;
        },

        escRegex(s) {
            return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        select(journal) {
            this.inputEl.value = journal.title;
            this.clearBtn.style.display = 'flex';
            this.close();
            NoMatch.hide();
            JournalCard.show(journal);
        },

        open() { this.listEl.classList.add('open'); },
        close() {
            this.listEl.classList.remove('open');
            this.activeIndex = -1;
        },
    };

    // -------------------------------------------------------
    // NoMatch — "not found" message
    // -------------------------------------------------------
    const NoMatch = {
        el: null,
        init() { this.el = document.getElementById('no-match'); },
        show() { this.el.classList.remove('hidden'); },
        hide() { this.el.classList.add('hidden'); },
    };

    // -------------------------------------------------------
    // JournalCard — selected journal detail display
    // -------------------------------------------------------
    const JournalCard = {
        el: null,
        currentJournal: null,

        init() {
            this.el = document.getElementById('journal-card');
            document.getElementById('add-to-list').addEventListener('click', () => {
                if (this.currentJournal) {
                    WorkingList.add(this.currentJournal);
                }
            });
        },

        show(journal) {
            this.currentJournal = journal;
            document.getElementById('card-title').textContent = journal.title;
            document.getElementById('card-publisher').textContent = journal.publisher || '';
            document.getElementById('card-field').textContent = journal.field ? `Field: ${journal.field}` : '';
            document.getElementById('card-abdc').textContent = journal.abdc || '—';
            document.getElementById('card-ajg').textContent = journal.ajg || '—';
            document.getElementById('card-points').textContent = journal.points;

            // Disable add button if already in list
            const btn = document.getElementById('add-to-list');
            const inList = WorkingList.items.some(it => it.journal.title === journal.title);
            btn.disabled = inList;
            btn.textContent = inList ? 'Already Added' : '+ Add to List';

            this.el.classList.remove('hidden');
        },

        hide() {
            this.el.classList.add('hidden');
            this.currentJournal = null;
        },

        refreshAddButton() {
            if (!this.currentJournal) return;
            const btn = document.getElementById('add-to-list');
            const inList = WorkingList.items.some(it => it.journal.title === this.currentJournal.title);
            btn.disabled = inList;
            btn.innerHTML = inList
                ? 'Already Added'
                : `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3v12M3 9h12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg> Add to List`;
        },
    };

    // -------------------------------------------------------
    // WorkingList — table of added journals with point calc
    // -------------------------------------------------------
    const WorkingList = {
        items: [],       // { journal, papers }
        emptyEl: null,
        tableWrap: null,
        tbody: null,
        grandTotalEl: null,

        init() {
            this.emptyEl = document.getElementById('empty-state');
            this.tableWrap = document.getElementById('table-wrapper');
            this.tbody = document.getElementById('table-body');
            this.grandTotalEl = document.getElementById('grand-total');
        },

        add(journal) {
            // Prevent duplicates
            if (this.items.some(it => it.journal.title === journal.title)) return;
            this.items.push({ journal, papers: 1 });
            this.render();
            JournalCard.refreshAddButton();
        },

        remove(index) {
            this.items.splice(index, 1);
            this.render();
            JournalCard.refreshAddButton();
        },

        setPapers(index, count) {
            const n = Math.max(0, parseInt(count) || 0);
            this.items[index].papers = n;
            this.updateTotals();
        },

        render() {
            if (this.items.length === 0) {
                this.emptyEl.classList.remove('hidden');
                this.tableWrap.classList.add('hidden');
                this.grandTotalEl.textContent = '0';
                return;
            }
            this.emptyEl.classList.add('hidden');
            this.tableWrap.classList.remove('hidden');

            this.tbody.innerHTML = this.items.map((item, i) => {
                const j = item.journal;
                const total = j.points * item.papers;
                return `
                    <tr class="row-enter" data-index="${i}">
                        <td class="cell-name">${this.esc(j.title)}</td>
                        <td class="cell-abdc">${j.abdc || '—'}</td>
                        <td class="cell-ajg">${j.ajg || '—'}</td>
                        <td class="cell-pts">${j.points}</td>
                        <td class="cell-count">
                            <input type="number" class="paper-input" value="${item.papers}" min="0" data-index="${i}" aria-label="Number of papers">
                        </td>
                        <td class="cell-total">${total}</td>
                        <td>
                            <button class="remove-btn" data-index="${i}" title="Remove journal" aria-label="Remove journal">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                </svg>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            // Bind events
            this.tbody.querySelectorAll('.paper-input').forEach(input => {
                input.addEventListener('input', (e) => {
                    const idx = parseInt(e.target.dataset.index);
                    this.setPapers(idx, e.target.value);
                });
            });
            this.tbody.querySelectorAll('.remove-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.dataset.index);
                    this.remove(idx);
                });
            });

            this.updateTotals();
        },

        updateTotals() {
            // Update individual row totals
            this.items.forEach((item, i) => {
                const row = this.tbody.querySelector(`tr[data-index="${i}"]`);
                if (row) {
                    const totalCell = row.querySelector('.cell-total');
                    totalCell.textContent = item.journal.points * item.papers;
                }
            });

            // Grand total
            const grand = this.items.reduce((sum, it) => sum + it.journal.points * it.papers, 0);
            this.grandTotalEl.textContent = grand;
            // Bump animation
            this.grandTotalEl.classList.remove('bump');
            requestAnimationFrame(() => this.grandTotalEl.classList.add('bump'));
        },

        esc(s) {
            const d = document.createElement('div');
            d.textContent = s;
            return d.innerHTML;
        },
    };

    // -------------------------------------------------------
    // Boot
    // -------------------------------------------------------
    async function init() {
        await DataStore.load();
        Autocomplete.init();
        NoMatch.init();
        JournalCard.init();
        WorkingList.init();

        // Focus search on load
        document.getElementById('journal-search').focus();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
