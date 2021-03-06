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

import Boom from 'boom';
import { adoptToHapiAuthFormat } from './auth';
import { httpServerMock } from '../http_server.mocks';

describe('adoptToHapiAuthFormat', () => {
  it('allows to associate arbitrary data with an incoming request', async () => {
    const authData = {
      state: { foo: 'bar' },
      requestHeaders: { authorization: 'baz' },
    };
    const authenticatedMock = jest.fn();
    const onSuccessMock = jest.fn();
    const onAuth = adoptToHapiAuthFormat((req, t) => t.authenticated(authData), onSuccessMock);
    await onAuth(
      httpServerMock.createRawRequest(),
      httpServerMock.createRawResponseToolkit({
        authenticated: authenticatedMock,
      })
    );

    expect(authenticatedMock).toBeCalledTimes(1);
    expect(authenticatedMock).toBeCalledWith({ credentials: authData.state });

    expect(onSuccessMock).toBeCalledTimes(1);
    const [[, onSuccessData]] = onSuccessMock.mock.calls;
    expect(onSuccessData).toEqual(authData);
  });

  it('Should allow redirecting to specified url', async () => {
    const redirectUrl = '/docs';
    const onSuccessMock = jest.fn();
    const onAuth = adoptToHapiAuthFormat((req, t) => t.redirected(redirectUrl), onSuccessMock);
    const takeoverSymbol = {};
    const redirectMock = jest.fn(() => ({ takeover: () => takeoverSymbol }));
    const result = await onAuth(
      httpServerMock.createRawRequest(),
      httpServerMock.createRawResponseToolkit({
        redirect: redirectMock,
      })
    );

    expect(redirectMock).toBeCalledWith(redirectUrl);
    expect(result).toBe(takeoverSymbol);
    expect(onSuccessMock).not.toHaveBeenCalled();
  });

  it('Should allow to specify statusCode and message for Boom error', async () => {
    const onSuccessMock = jest.fn();
    const onAuth = adoptToHapiAuthFormat(
      (req, t) => t.rejected(new Error('not found'), { statusCode: 404 }),
      onSuccessMock
    );
    const result = (await onAuth(
      httpServerMock.createRawRequest(),
      httpServerMock.createRawResponseToolkit()
    )) as Boom;

    expect(result).toBeInstanceOf(Boom);
    expect(result.message).toBe('not found');
    expect(result.output.statusCode).toBe(404);
    expect(onSuccessMock).not.toHaveBeenCalled();
  });

  it('Should return Boom.internal error error if interceptor throws', async () => {
    const onAuth = adoptToHapiAuthFormat((req, t) => {
      throw new Error('unknown error');
    });
    const result = (await onAuth(
      httpServerMock.createRawRequest(),
      httpServerMock.createRawResponseToolkit()
    )) as Boom;

    expect(result).toBeInstanceOf(Boom);
    expect(result.message).toBe('unknown error');
    expect(result.output.statusCode).toBe(500);
  });

  it('Should return Boom.internal error if interceptor returns unexpected result', async () => {
    const onAuth = adoptToHapiAuthFormat(async (req, t) => undefined as any);
    const result = (await onAuth(
      httpServerMock.createRawRequest(),
      httpServerMock.createRawResponseToolkit()
    )) as Boom;

    expect(result).toBeInstanceOf(Boom);
    expect(result.message).toBe(
      'Unexpected result from Authenticate. Expected AuthResult, but given: undefined.'
    );
    expect(result.output.statusCode).toBe(500);
  });
});
