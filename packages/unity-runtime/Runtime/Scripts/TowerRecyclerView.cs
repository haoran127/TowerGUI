using UnityEngine;
using UnityEngine.UI;
using System;
using System.Collections.Generic;

namespace TowerUI
{
    /// <summary>
    /// High-performance UGUI virtual list built on ScrollRect.
    /// Only creates enough cells to fill the viewport + buffer, then recycles them
    /// as the user scrolls. Supports fixed and variable row heights.
    /// Typical SLG usage: alliance lists, mail, chat, leaderboards, inventories.
    /// </summary>
    [RequireComponent(typeof(ScrollRect))]
    public class TowerRecyclerView : MonoBehaviour
    {
        [SerializeField] private GameObject _cellPrefab;
        [SerializeField] private float _cellHeight = 80f;
        [SerializeField] private int _bufferCount = 2;
        [SerializeField] private RectTransform _viewport;
        [SerializeField] private RectTransform _content;

        public Action<int, GameObject> onCellUpdate;
        public Func<int, float> getCellHeight;
        public Action onEndReached;
        [SerializeField] private float _endReachedThreshold = 100f;

        private ScrollRect _scrollRect;
        private readonly List<CellInfo> _activeCells = new();
        private readonly Queue<GameObject> _pool = new();
        private int _itemCount;
        private float _viewportHeight;
        private float[] _cellTops;
        private float _totalHeight;
        private bool _dirty;
        private bool _endFired;

        private struct CellInfo
        {
            public int index;
            public GameObject go;
            public RectTransform rt;
        }

        private void Awake()
        {
            _scrollRect = GetComponent<ScrollRect>();
            if (_viewport == null) _viewport = _scrollRect.viewport;
            if (_content == null) _content = _scrollRect.content;

            _scrollRect.onValueChanged.AddListener(OnScroll);
        }

        private void OnDestroy()
        {
            if (_scrollRect != null)
                _scrollRect.onValueChanged.RemoveListener(OnScroll);
        }

        /// <summary>
        /// Set data count and refresh the list.
        /// </summary>
        public void SetItemCount(int count)
        {
            _itemCount = count;
            _endFired = false;
            RebuildLayout();
            RefreshVisibleCells();
        }

        /// <summary>
        /// Notify that data at specific index has changed.
        /// </summary>
        public void RefreshCell(int index)
        {
            foreach (var cell in _activeCells)
            {
                if (cell.index == index)
                {
                    onCellUpdate?.Invoke(index, cell.go);
                    return;
                }
            }
        }

        /// <summary>
        /// Refresh all currently visible cells.
        /// </summary>
        public void RefreshAllVisible()
        {
            foreach (var cell in _activeCells)
                onCellUpdate?.Invoke(cell.index, cell.go);
        }

        /// <summary>
        /// Scroll to a specific item index.
        /// </summary>
        public void ScrollToIndex(int index, bool animated = false)
        {
            if (_cellTops == null || index < 0 || index >= _itemCount) return;
            float targetY = _cellTops[index];
            float maxScroll = Mathf.Max(0, _totalHeight - _viewportHeight);
            targetY = Mathf.Clamp(targetY, 0, maxScroll);

            _content.anchoredPosition = new Vector2(_content.anchoredPosition.x, targetY);
            RefreshVisibleCells();
        }

        public void ScrollToTop() => ScrollToIndex(0);

        public void ScrollToBottom()
        {
            if (_itemCount > 0) ScrollToIndex(_itemCount - 1);
        }

        public int ItemCount => _itemCount;
        public int VisibleCellCount => _activeCells.Count;
        public int PooledCount => _pool.Count;

        private void RebuildLayout()
        {
            _viewportHeight = _viewport != null ? _viewport.rect.height : 600f;
            _cellTops = new float[_itemCount];
            _totalHeight = 0;

            for (int i = 0; i < _itemCount; i++)
            {
                _cellTops[i] = _totalHeight;
                float h = getCellHeight != null ? getCellHeight(i) : _cellHeight;
                _totalHeight += h;
            }

            _content.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical, _totalHeight);
        }

        private void OnScroll(Vector2 _)
        {
            RefreshVisibleCells();
        }

        private void RefreshVisibleCells()
        {
            if (_cellTops == null || _itemCount == 0)
            {
                RecycleAll();
                return;
            }

            float scrollY = _content.anchoredPosition.y;
            float viewTop = scrollY;
            float viewBottom = scrollY + _viewportHeight;

            int startIdx = FindFirstVisible(viewTop);
            int endIdx = FindLastVisible(viewBottom);

            startIdx = Mathf.Max(0, startIdx - _bufferCount);
            endIdx = Mathf.Min(_itemCount - 1, endIdx + _bufferCount);

            var needed = new HashSet<int>();
            for (int i = startIdx; i <= endIdx; i++) needed.Add(i);

            for (int i = _activeCells.Count - 1; i >= 0; i--)
            {
                if (!needed.Contains(_activeCells[i].index))
                {
                    RecycleCell(i);
                }
            }

            var activeIndices = new HashSet<int>();
            foreach (var c in _activeCells) activeIndices.Add(c.index);

            for (int i = startIdx; i <= endIdx; i++)
            {
                if (!activeIndices.Contains(i))
                {
                    CreateCell(i);
                }
            }

            foreach (var cell in _activeCells)
            {
                PositionCell(cell);
            }

            if (onEndReached != null && !_endFired)
            {
                if (_totalHeight - viewBottom < _endReachedThreshold)
                {
                    _endFired = true;
                    onEndReached.Invoke();
                }
            }
        }

        private int FindFirstVisible(float y)
        {
            int lo = 0, hi = _itemCount - 1;
            while (lo < hi)
            {
                int mid = (lo + hi) / 2;
                float bottom = _cellTops[mid] + (getCellHeight != null ? getCellHeight(mid) : _cellHeight);
                if (bottom <= y) lo = mid + 1;
                else hi = mid;
            }
            return lo;
        }

        private int FindLastVisible(float y)
        {
            int lo = 0, hi = _itemCount - 1;
            while (lo < hi)
            {
                int mid = (lo + hi + 1) / 2;
                if (_cellTops[mid] >= y) hi = mid - 1;
                else lo = mid;
            }
            return lo;
        }

        private void CreateCell(int index)
        {
            GameObject go;
            if (_pool.Count > 0)
            {
                go = _pool.Dequeue();
                go.SetActive(true);
            }
            else
            {
                go = Instantiate(_cellPrefab, _content);
            }

            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = new Vector2(0, 1);
            rt.anchorMax = new Vector2(1, 1);
            rt.pivot = new Vector2(0, 1);

            var cell = new CellInfo { index = index, go = go, rt = rt };
            _activeCells.Add(cell);
            onCellUpdate?.Invoke(index, go);
        }

        private void PositionCell(CellInfo cell)
        {
            float h = getCellHeight != null ? getCellHeight(cell.index) : _cellHeight;
            cell.rt.anchoredPosition = new Vector2(0, -_cellTops[cell.index]);
            cell.rt.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical, h);
        }

        private void RecycleCell(int listIndex)
        {
            var cell = _activeCells[listIndex];
            cell.go.SetActive(false);
            _pool.Enqueue(cell.go);
            _activeCells.RemoveAt(listIndex);
        }

        private void RecycleAll()
        {
            for (int i = _activeCells.Count - 1; i >= 0; i--)
                RecycleCell(i);
        }

        private void OnRectTransformDimensionsChange()
        {
            if (_cellTops != null && _viewport != null)
            {
                float newH = _viewport.rect.height;
                if (Mathf.Abs(newH - _viewportHeight) > 1f)
                {
                    _viewportHeight = newH;
                    RefreshVisibleCells();
                }
            }
        }
    }
}
