import {Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChange} from '@angular/core';
import {Subject, Subscription} from 'rxjs';
import {takeUntil} from 'rxjs/operators';

import {Grid} from './lib/grid';
import {DataSource} from './lib/data-source/data-source';
import {Row} from './lib/data-set/row';
import {deepExtend, getPageForRowIndex} from './lib/helpers';
import {LocalDataSource} from './lib/data-source/local/local.data-source';

@Component({
  selector: 'ngx-smart-table',
  styleUrls: ['./ngx-smart-table.component.scss'],
  templateUrl: './ngx-smart-table.component.html',
})
export class NgxSmartTableComponent implements OnChanges, OnDestroy, OnInit {

  @Input() source: any;
  @Input() toggleEvent: any;
  @Input() settings: Object = {};


  @Output() rowSelect = new EventEmitter<any>();
  @Output() rowDeselect = new EventEmitter<any>();
  @Output() userRowSelect = new EventEmitter<any>();
  @Output() delete = new EventEmitter<any>();
  @Output() edit = new EventEmitter<any>();
  @Output() create = new EventEmitter<any>();
  @Output() custom = new EventEmitter<any>();
  @Output() deleteConfirm = new EventEmitter<any>();
  @Output() editConfirm = new EventEmitter<any>();
  @Output() createConfirm = new EventEmitter<any>();
  @Output() rowHover: EventEmitter<any> = new EventEmitter<any>();
  @Output() onFilter: EventEmitter<any> = new EventEmitter<any>();

  tableClass: string;
  tableId: string;
  perPageSelect: any;
  isPagerDisplay: boolean;
  tableType: string; // added
  hideHeader: boolean; // added
  hideSubHeader: boolean; // added
  fixedColNumber: string;
  scrollableCellWidth: string;
  customClassName: string;
  rowClassFunction: Function;

  grid: Grid;

  defaultSettings: Object = {
    tableType: 'default',
    mode: 'inline', // inline|external|click-to-edit
    selectMode: 'none', // single|multi|none
    /**
     * Points to an element in all data
     *
     * when < 0 all lines must be deselected
     */
    selectedRowIndex: 0,
    switchPageToSelectedRowPage: false,
    hideHeader: false,
    hideSubHeader: false,
    keyColumn: undefined,
    actions: {
      columnTitle: 'Actions',
      add: true,
      edit: true,
      delete: true,
      custom: [],
      position: 'left', // left|right
    },
    filter: {
      inputClass: '',
    },
    edit: {
      inputClass: '',
      editButtonContent: 'Edit',
      saveButtonContent: 'Update',
      cancelButtonContent: 'Cancel',
      confirmSave: false,
    },
    add: {
      inputClass: '',
      addButtonContent: 'Add New',
      createButtonContent: 'Create',
      cancelButtonContent: 'Cancel',
      confirmCreate: false,
    },
    delete: {
      deleteButtonContent: 'Delete',
      confirmDelete: false,
    },
    expand: {
      expandRowButtonContent: 'Expand'
    },
    attr: {
      id: '',
      class: '',
    },
    noDataMessage: 'No data found',
    columns: {},
    pager: {
      display: true,
      page: 1,
      perPage: 10,
    },
    rowClassFunction: () => '',
  };

  isAllSelected: boolean = false;

  private onSelectRowSubscription: Subscription;
  private onDeselectRowSubscription: Subscription;
  private destroyed$: Subject<void> = new Subject<void>();

  constructor() {

  }

  ngOnInit() {
    if (this.grid) {
      this.getHideCustomClassName();
      const percentList = [];
      const allWidthPercentage  = this.grid.getColumns().filter(item => item.width && !item.isScrollable);
      allWidthPercentage.map(col => {
        const numbers = parseFloat(col.width.replace('%', ''));
        percentList.push(numbers);
      });
      const percent = percentList.reduce((num, a) => num + a, 0);
      this.scrollableCellWidth = 100 - percent + '%';
      this.fixedColNumber = percent + '%';
    }
  }

  ngOnChanges(changes: { [propertyName: string]: SimpleChange }) {
    if (this.grid) {
      if (changes['settings']) {
        this.grid.setSettings(this.prepareSettings());
      }
      if (changes['source']) {
        this.source = this.prepareSource();
        this.grid.setSource(this.source);
      }
      if(changes['toggleEvent']){
        console.log(this.customClassName);
        this.updateCustomClassName(this.customClassName);
        this.grid.setSettings(this.prepareSettings());
      }

    } else {
      this.initGrid();
    }
    console.log(this.grid.getSetting('hideSubHeader'));
    this.tableId = this.grid.getSetting('attr.id');
    this.tableClass = this.grid.getSetting('attr.class');
    this.isPagerDisplay = this.grid.getSetting('pager.display');
    this.isPagerDisplay = this.grid.getSetting('pager.display');
    this.perPageSelect = this.grid.getSetting('pager.perPageSelect');
    this.tableType = this.grid.getSetting('tableType'); // added
    this.hideSubHeader = this.grid.getSetting('hideSubHeader'); // added
    this.hideHeader = this.grid.getSetting('hideHeader'); // added
    this.rowClassFunction = this.grid.getSetting('rowClassFunction');
  }

  getHideCustomClassName() {
    const customClassNameList = [];
    if (this.settings['columns']) {
      Object.keys(this.settings['columns']).map(key => {
        if (this.settings['columns'][key].columnClass) {
          customClassNameList.push(this.settings['columns'][key].columnClass);
        }
      });
    }
    this.customClassName = customClassNameList.filter((v, i, a) => a.indexOf(v) === i)[0];
  }

  updateCustomClassName(customClassName) {
    const settings = this.settings;
    if (settings['columns']) {
      Object.keys(settings['columns']).map(key => {
        if (settings['columns'][key].columnClass) {
          settings['columns'][key].columnClass = customClassName + '-' + this.toggleEvent;
        }
      });
    }
    this.settings = settings;
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
  }

  selectRow(index: number, switchPageToSelectedRowPage: boolean = this.grid.getSetting('switchPageToSelectedRowPage')): void {
    if (!this.grid) {
      return;
    }
    this.grid.settings.selectedRowIndex = index;
    if (this.isIndexOutOfRange(index)) {
      // we need to deselect all rows if we got an incorrect index
      this.deselectAllRows();
      return;
    }

    if (switchPageToSelectedRowPage) {
      const source: DataSource = this.source;
      const paging: { page: number, perPage: number } = source.getPaging();
      const page: number = getPageForRowIndex(index, paging.perPage);
      index = index % paging.perPage;
      this.grid.settings.selectedRowIndex = index;

      if (page !== paging.page) {
        source.setPage(page);
        return;
      }

    }

    const row: Row = this.grid.getRows()[index];
    if (row) {
      this.onSelectRow(row);
    } else {
      // we need to deselect all rows if we got an incorrect index
      this.deselectAllRows();
    }
  }

  private deselectAllRows(): void {
    this.grid.dataSet.deselectAll();
    this.emitDeselectRow(null);
  }

  editRowSelect(row: Row) {
    if (this.grid.getSetting('selectMode') === 'multi') {
      this.onMultipleSelectRow(row);
    } else {
      this.onSelectRow(row);
    }
  }

  onUserSelectRow(row: Row) {
    if (this.grid.getSetting('selectMode') !== 'multi') {
      this.grid.selectRow(row);
      this.emitUserSelectRow(row);
      this.emitSelectRow(row);
    }
  }

  onRowHover(row: Row) {
    this.rowHover.emit(row);
  }

  multipleSelectRow(row: Row) {
    row.isSelected = !row.isSelected;
    this.grid.multipleSelectRow(row);
    this.emitUserSelectRow(row);
    this.emitSelectRow(row);
  }

  onSelectAllRows() {
    this.isAllSelected = !this.isAllSelected;

    this.grid.selectAllRows(this.isAllSelected);

    this.emitUserSelectRow(null);
    this.emitSelectRow(null);
  }

  onSelectRow(row: Row) {
    this.grid.selectRow(row);
    this.emitSelectRow(row);
  }

  onExpandRow(row: Row) {
    this.grid.expandRow(row);
  }

  onMultipleSelectRow(row: Row) {
    this.emitSelectRow(row);
  }

  initGrid() {
    this.source = this.prepareSource();
    this.grid = new Grid(this.source, this.prepareSettings());

    this.subscribeToOnSelectRow();
    this.subscribeToOnDeselectRow();
  }

  prepareSource(): DataSource {
    if (this.source instanceof DataSource) {
      return this.source;
    } else if (this.source instanceof Array) {
      return new LocalDataSource(this.source);
    }

    return new LocalDataSource();
  }

  prepareSettings(): Object {
    return deepExtend({}, this.defaultSettings, this.settings);
  }

  changePage($event: any) {
    this.resetAllSelector();
  }

  sort($event: any) {
    this.resetAllSelector();
  }

  filter($event: any) {
    this.grid.filterApplied = $event.filterConf.filters;
    this.onFilter.emit($event);
    this.resetAllSelector();
  }

  private resetAllSelector() {
    this.isAllSelected = false;
  }

  private emitUserSelectRow(row: Row) {
    const selectedRows = this.grid.getSelectedRows();
    this.userRowSelect.emit({
      data: row ? row.getData() : null,
      isSelected: row ? row.getIsSelected() : null,
      source: this.source,
      selected: selectedRows && selectedRows.length ? selectedRows.map((r: Row) => r.getData()) : [],
    });
  }

  private emitSelectRow(row: Row) {
    const data = {
      data: row ? row.getData() : null,
      isSelected: row ? row.getIsSelected() : null,
      isExpanded: row ? row.getIsExpanded() : null,
      source: this.source,
    };
    this.rowSelect.emit(data);
    if (!row?.isSelected) {
      this.rowDeselect.emit(data);
    }
    if (!row?.isExpanded) {
      this.rowDeselect.emit(data);
    }
  }

  private emitDeselectRow(row: Row): void {
    this.rowDeselect.emit({
      data: row ? row.getData() : null,
      isSelected: row ? row.getIsSelected() : null,
      source: this.source,
    });
  }

  private isIndexOutOfRange(index: number): boolean {
    const dataAmount: number = this.source?.count();
    return index < 0 || (typeof dataAmount === 'number' && index >= dataAmount);
  }

  private subscribeToOnSelectRow(): void {
    if (this.onSelectRowSubscription) {
      this.onSelectRowSubscription.unsubscribe();
    }
    this.onSelectRowSubscription = this.grid.onSelectRow()
      .pipe(takeUntil(this.destroyed$))
      .subscribe((row) => {
        this.emitSelectRow(row);
      });
  }

  private subscribeToOnDeselectRow(): void {
    if (this.onDeselectRowSubscription) {
      this.onDeselectRowSubscription.unsubscribe();
    }
    this.onDeselectRowSubscription = this.grid.onDeselectRow()
      .pipe(takeUntil(this.destroyed$))
      .subscribe((row) => {
        this.emitDeselectRow(row);
      });
  }

}
