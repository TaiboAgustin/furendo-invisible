import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neutralizar, MODELO_POR_DEFECTO, type Generador } from '../src/neutro.ts';

test('manda el texto con las instrucciones y limpia comillas de la respuesta', async () => {
  let pedido: { modelo: string; entrada: any } | null = null;
  const generar: Generador = async (modelo, entrada) => {
    pedido = { modelo, entrada };
    return { response: '  "¿Qué talle de buzo usás?"  ' };
  };
  assert.equal(await neutralizar('che q talle de buzo usas?? jaja', generar), '¿Qué talle de buzo usás?');
  assert.equal(pedido!.modelo, MODELO_POR_DEFECTO);
  assert.equal(pedido!.entrada.messages[1].content, 'che q talle de buzo usas?? jaja');
  assert.match(pedido!.entrada.messages[0].content, /mismo significado/);
});

test('acepta respuestas con formato OpenAI', async () => {
  const generar: Generador = async () => ({ choices: [{ message: { content: '¿Preferís negro o gris?' } }] });
  assert.equal(await neutralizar('negro o gris?', generar), '¿Preferís negro o gris?');
});

test('rechaza respuestas vacías o desproporcionadas', async () => {
  await assert.rejects(neutralizar('hola', async () => ({ response: '   ' })), /no devolvió/);
  await assert.rejects(neutralizar('hola', async () => ({ response: 'x'.repeat(500) })), /no devolvió/);
});
