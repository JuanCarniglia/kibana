/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Filter } from '@kbn/es-query';
import { InjectedIntl, injectI18n } from '@kbn/i18n/react';
import classNames from 'classnames';
import React, { Component } from 'react';
import ResizeObserver from 'resize-observer-polyfill';
import { Storage } from 'ui/storage';
import { get, isEqual } from 'lodash';

import { toastNotifications } from 'ui/notify';
import { IndexPattern, Query, QueryBar, FilterBar } from '../../../../data/public';
import { SavedQuery, SavedQueryAttributes } from '../index';
import { saveQuery } from '../lib/saved_query_service';
import { SavedQueryMeta, SaveQueryForm } from './save_query_form';
import { SavedQueryManager } from './saved_query_manager';

interface DateRange {
  from: string;
  to: string;
}

/**
 * NgReact lib requires that changes to the props need to be made in the directive config as well
 * See [search_bar\directive\index.js] file
 */
export interface SearchBarProps {
  appName: string;
  intl: InjectedIntl;
  indexPatterns?: IndexPattern[];
  savedQuery?: SavedQuery;
  // Query bar
  showQueryBar?: boolean;
  showQueryInput?: boolean;
  screenTitle?: string;
  store?: Storage;
  query?: Query;
  onQuerySubmit?: (payload: { dateRange: DateRange; query?: Query }) => void;
  // Filter bar
  showFilterBar?: boolean;
  filters?: Filter[];
  onFiltersUpdated?: (filters: Filter[]) => void;
  // Date picker
  showDatePicker?: boolean;
  dateRangeFrom?: string;
  dateRangeTo?: string;
  // Autorefresh
  isRefreshPaused?: boolean;
  refreshInterval?: number;
  showAutoRefreshOnly?: boolean;
  showSaveQuery?: boolean;
  onRefreshChange?: (options: { isPaused: boolean; refreshInterval: number }) => void;
  onSaved?: (savedQuery: SavedQuery) => void;
  onSavedQueryUpdated: (savedQuery: SavedQuery) => void;
  onClearSavedQuery: () => void;
  customSubmitButton?: any;
}

interface State {
  isFiltersVisible: boolean;
  showSaveQueryModal: boolean;
  showSaveNewQueryModal: boolean;
  showSavedQueryPopover: boolean;
  currentProps?: Props;
  query: Query;
  dateRangeFrom: string;
  dateRangeTo: string;
}

class SearchBarUI extends Component<SearchBarProps, State> {
  public static defaultProps = {
    showQueryBar: true,
    showFilterBar: true,
    showDatePicker: true,
    showAutoRefreshOnly: false,
  };

  public filterBarRef: Element | null = null;
  public filterBarWrapperRef: Element | null = null;

  public static getDerivedStateFromProps(nextProps: Props, prevState: State) {
    if (isEqual(prevState.currentProps, nextProps)) {
      return null;
    }

    let nextQuery = null;
    if (nextProps.query.query !== get(prevState, 'currentProps.query.query')) {
      nextQuery = {
        query: nextProps.query.query,
        language: nextProps.query.language,
      };
    } else if (nextProps.query.language !== prevState.query.language) {
      nextQuery = {
        query: '',
        language: nextProps.query.language,
      };
    }

    let nextDateRange = null;
    if (
      nextProps.dateRangeFrom !== get(prevState, 'currentProps.dateRangeFrom') ||
      nextProps.dateRangeTo !== get(prevState, 'currentProps.dateRangeTo')
    ) {
      nextDateRange = {
        dateRangeFrom: nextProps.dateRangeFrom,
        dateRangeTo: nextProps.dateRangeTo,
      };
    }

    const nextState: any = {
      currentProps: nextProps,
    };
    if (nextQuery) {
      nextState.query = nextQuery;
    }
    if (nextDateRange) {
      nextState.dateRangeFrom = nextDateRange.dateRangeFrom;
      nextState.dateRangeTo = nextDateRange.dateRangeTo;
    }
    return nextState;
  }

  /*
   Keep the "draft" value in local state until the user actually submits the query. There are a couple advantages:

    1. Each app doesn't have to maintain its own "draft" value if it wants to put off updating the query in app state
    until the user manually submits their changes. Most apps have watches on the query value in app state so we don't
    want to trigger those on every keypress. Also, some apps (e.g. dashboard) already juggle multiple query values,
    each with slightly different semantics and I'd rather not add yet another variable to the mix.

    2. Changes to the local component state won't trigger an Angular digest cycle. Triggering digest cycles on every
    keypress has been a major source of performance issues for us in previous implementations of the query bar.
    See https://github.com/elastic/kibana/issues/14086
  */
  public state = {
    isFiltersVisible: true,
    showSaveQueryModal: false,
    showSaveNewQueryModal: false,
    showSavedQueryPopover: false,
    currentProps: this.props,
    query: {
      query: this.props.query.query,
      language: this.props.query.language,
    },
    dateRangeFrom: _.get(this.props, 'dateRangeFrom', 'now-15m'),
    dateRangeTo: _.get(this.props, 'dateRangeTo', 'now'),
  };

  public isDirty = () => {
    if (!this.props.showDatePicker) {
      return this.state.query.query !== this.props.query.query;
    }

    return (
      this.state.query.query !== this.props.query.query ||
      this.state.dateRangeFrom !== this.props.dateRangeFrom ||
      this.state.dateRangeTo !== this.props.dateRangeTo
    );
  };

  private getFilterLength() {
    if (this.props.showFilterBar && this.props.filters) {
      return this.props.filters.length;
    }
  }

  private getFilterUpdateFunction() {
    if (this.props.showFilterBar && this.props.onFiltersUpdated) {
      return this.props.onFiltersUpdated;
    }
    return (filters: Filter[]) => {};
  }

  private shouldRenderQueryBar() {
    const showDatePicker = this.props.showDatePicker || this.props.showAutoRefreshOnly;
    const showQueryInput =
      this.props.showQueryInput && this.props.indexPatterns && this.props.query;
    return this.props.showQueryBar && (showDatePicker || showQueryInput);
  }

  private shouldRenderFilterBar() {
    return this.props.showFilterBar && this.props.filters && this.props.indexPatterns;
  }

  private getFilterTriggerButton() {
    const filtersAppliedText = this.props.intl.formatMessage({
      id: 'kibana_react.search.searchBar.filtersButtonFiltersAppliedTitle',
      defaultMessage: 'filters applied.',
    });
    const clickToShowOrHideText = this.state.isFiltersVisible
      ? this.props.intl.formatMessage({
          id: 'kibana_react.search.searchBar.filtersButtonClickToShowTitle',
          defaultMessage: 'Select to hide',
        })
      : this.props.intl.formatMessage({
          id: 'kibana_react.search.searchBar.filtersButtonClickToHideTitle',
          defaultMessage: 'Select to show',
        });

    const filterCount = this.getFilterLength();
    return (
      <EuiFilterButton
        onClick={this.toggleFiltersVisible}
        isSelected={this.state.isFiltersVisible}
        hasActiveFilters={this.state.isFiltersVisible}
        numFilters={filterCount ? this.getFilterLength() : undefined}
        aria-controls="GlobalFilterGroup"
        aria-expanded={!!this.state.isFiltersVisible}
        title={`${filterCount ? filtersAppliedText : ''} ${clickToShowOrHideText}`}
      >
        Filters
      </EuiFilterButton>
    );
  }

  public setFilterBarHeight = () => {
    requestAnimationFrame(() => {
      const height =
        this.filterBarRef && this.state.isFiltersVisible ? this.filterBarRef.clientHeight : 0;
      if (this.filterBarWrapperRef) {
        this.filterBarWrapperRef.setAttribute('style', `height: ${height}px`);
      }
    });
  };

  // member-ordering rules conflict with use-before-declaration rules
  /* eslint-disable */
  public ro = new ResizeObserver(this.setFilterBarHeight);
  /* eslint-enable */

  public onSave = async (savedQueryMeta: SavedQueryMeta, saveAsNew = false) => {
    const savedQueryAttributes: SavedQueryAttributes = {
      title: savedQueryMeta.title,
      description: savedQueryMeta.description,
      query: this.state.query,
    };

    if (savedQueryMeta.shouldIncludeFilters) {
      savedQueryAttributes.filters = this.props.filters;
    }

    if (
      savedQueryMeta.shouldIncludeTimefilter &&
      this.state.dateRangeTo !== undefined &&
      this.state.dateRangeFrom !== undefined &&
      this.props.refreshInterval !== undefined &&
      this.props.isRefreshPaused !== undefined
    ) {
      savedQueryAttributes.timefilter = {
        timeFrom: this.state.dateRangeFrom,
        timeTo: this.state.dateRangeTo,
        refreshInterval: {
          value: this.props.refreshInterval,
          pause: this.props.isRefreshPaused,
        },
      };
    }

    try {
      let response;
      if (this.props.savedQuery && !saveAsNew) {
        response = await saveQuery(savedQueryAttributes, this.props.savedQuery.id);
      } else {
        response = await saveQuery(savedQueryAttributes);
      }

      toastNotifications.addSuccess(`Your query "${response.attributes.title}" was saved`);

      this.setState({
        showSaveQueryModal: false,
        showSaveNewQueryModal: false,
      });

      if (this.props.onSaved) {
        this.props.onSaved(response);
      }

      if (this.props.onQuerySubmit) {
        this.props.onQuerySubmit({
          query: this.state.query,
          dateRange: {
            from: this.state.dateRangeFrom,
            to: this.state.dateRangeTo,
          },
        });
      }
    } catch (error) {
      toastNotifications.addDanger(`An error occured while saving your query: ${error.message}`);
      throw error;
    }
  };

  public onInitiateSave = () => {
    this.setState({
      showSaveQueryModal: true,
    });
  };

  public onInitiateSaveNew = () => {
    this.setState({
      showSaveNewQueryModal: true,
    });
  };

  public onQueryBarChange = (queryAndDateRange: { dateRange: DateRange; query: Query }) => {
    this.setState({
      query: queryAndDateRange.query,
      dateRangeFrom: queryAndDateRange.dateRange.from,
      dateRangeTo: queryAndDateRange.dateRange.to,
    });
  };

  public onQueryBarSubmit = (queryAndDateRange: { dateRange?: DateRange; query: Query }) => {
    this.setState(
      {
        query: queryAndDateRange.query,
        dateRangeFrom:
          (queryAndDateRange.dateRange && queryAndDateRange.dateRange.from) ||
          this.state.dateRangeFrom,
        dateRangeTo:
          (queryAndDateRange.dateRange && queryAndDateRange.dateRange.to) || this.state.dateRangeTo,
      },
      () => {
        this.props.onQuerySubmit({
          query: this.state.query,
          dateRange: {
            from: this.state.dateRangeFrom,
            to: this.state.dateRangeTo,
          },
        });
      }
    );
  };

  public onLoadSavedQuery = (savedQuery: SavedQuery) => {
    const dateRangeFrom = get(
      savedQuery,
      'attributes.timefilter.timeFrom',
      this.state.dateRangeFrom
    );
    const dateRangeTo = get(savedQuery, 'attributes.timefilter.timeTo', this.state.dateRangeTo);

    this.setState({
      query: savedQuery.attributes.query,
      dateRangeFrom,
      dateRangeTo,
    });

    this.props.onSavedQueryUpdated(savedQuery);
  };

  public componentDidMount() {
    if (this.filterBarRef) {
      this.setFilterBarHeight();
      this.ro.observe(this.filterBarRef);
    }
  }

  public componentDidUpdate() {
    if (this.filterBarRef) {
      this.setFilterBarHeight();
      this.ro.unobserve(this.filterBarRef);
    }
  }

  public render() {
    const savedQueryManager = (
      <SavedQueryManager
        isDirty={this.isDirty()}
        showSaveQuery={this.props.showSaveQuery}
        loadedSavedQuery={this.props.savedQuery}
        onSave={this.onInitiateSave}
        onSaveAsNew={this.onInitiateSaveNew}
        onLoad={this.onLoadSavedQuery}
        query={this.state.query}
        onClearSavedQuery={this.props.onClearSavedQuery}
      ></SavedQueryManager>
    );

    let queryBar;
    if (this.shouldRenderQueryBar()) {
      queryBar = (
          <QueryBar
            query={this.state.query}
            savedQuery={this.props.savedQuery ? this.props.savedQuery.attributes : undefined}
            screenTitle={this.props.screenTitle}
            onSubmit={this.onQueryBarSubmit}
            appName={this.props.appName}
            indexPatterns={this.props.indexPatterns}
            store={this.props.store!}
            prepend={this.props.showFilterBar ? savedQueryManager : ''}
            showQueryInput={this.props.showQueryInput}
            showSaveQuery={this.props.showSaveQuery}
            showDatePicker={this.props.showDatePicker}
            dateRangeFrom={this.state.dateRangeFrom}
            dateRangeTo={this.state.dateRangeTo}
            isRefreshPaused={this.props.isRefreshPaused}
            refreshInterval={this.props.refreshInterval}
            showAutoRefreshOnly={this.props.showAutoRefreshOnly}
            onRefreshChange={this.props.onRefreshChange}
            onSave={this.onInitiateSave}
            onSaveNew={this.onInitiateSaveNew}
            onChange={this.onQueryBarChange}
            onLoadSavedQuery={this.onLoadSavedQuery}
            isDirty={this.isDirty()}
            customSubmitButton={
              this.props.customSubmitButton ? this.props.customSubmitButton : undefined
            }
            onClearSavedQuery={this.props.onClearSavedQuery}
          />
        );
    }

    let filterBar;
    if (this.shouldRenderFilterBar()) {
      const filterGroupClasses = classNames('globalFilterGroup__wrapper', {
        'globalFilterGroup__wrapper-isVisible': this.state.isFiltersVisible,
      });
      filterBar = (
        <div
          id="GlobalFilterGroup"
          ref={node => {
            this.filterBarWrapperRef = node;
          }}
          className={filterGroupClasses}
        >
          <div
            ref={node => {
              this.filterBarRef = node;
            }}
          >
            <FilterBar
              className="globalFilterGroup__filterBar"
              filters={this.props.filters!}
              onFiltersUpdated={this.getFilterUpdateFunction()}
              indexPatterns={this.props.indexPatterns!}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="globalQueryBar">
        {queryBar}
        {filterBar}

        {this.state.showSaveQueryModal ? (
          <SaveQueryForm
            savedQuery={this.props.savedQuery ? this.props.savedQuery.attributes : undefined}
            onSave={this.onSave}
            onClose={() => this.setState({ showSaveQueryModal: false })}
            showFilterOption={this.props.showFilterBar}
            showTimeFilterOption={this.props.showDatePicker}
          />
        ) : null}
        {this.state.showSaveNewQueryModal ? (
          <SaveQueryForm
            onSave={savedQueryMeta => this.onSave(savedQueryMeta, true)}
            onClose={() => this.setState({ showSaveNewQueryModal: false })}
            showFilterOption={this.props.showFilterBar}
            showTimeFilterOption={this.props.showDatePicker}
          />
        ) : null}
      </div>
    );
  }
}

export const SearchBar = injectI18n(SearchBarUI);
