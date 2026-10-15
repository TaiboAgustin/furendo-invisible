import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortear, enteroAleatorio, reacomodar } from '../src/sorteo.ts';

function esUnaSolaRonda(ids: number[], asignaciones: { giver: number; receiver: number }[]) {
  const siguiente = new Map(asignaciones.map((a) => [a.giver, a.receiver]));
  let actual = ids[0];
  const vistos = new Set<number>();
  for (let i = 0; i < ids.length; i++) {
    vistos.add(actual);
    actual = siguiente.get(actual)!;
  }
  return actual === ids[0] && vistos.size === ids.length;
}

test('cada uno regala una vez, recibe una vez y nadie se toca a sí mismo', () => {
  for (let n = 3; n <= 30; n++) {
    const ids = Array.from({ length: n }, (_, i) => i + 100);
    const r = sortear(ids);
    assert.equal(r.length, n);
    assert.deepEqual(new Set(r.map((a) => a.giver)), new Set(ids));
    assert.deepEqual(new Set(r.map((a) => a.receiver)), new Set(ids));
    assert.ok(r.every((a) => a.giver !== a.receiver));
    assert.ok(esUnaSolaRonda(ids, r), `n=${n} no forma una sola ronda`);
  }
});

test('todas las rondas posibles salen con frecuencias parecidas', () => {
  // Con 4 personas hay 3! = 6 rondas distintas.
  const conteo = new Map<string, number>();
  const vueltas = 12000;
  for (let i = 0; i < vueltas; i++) {
    const r = sortear([1, 2, 3, 4]);
    const sig = new Map(r.map((a) => [a.giver, a.receiver]));
    const clave = [1, sig.get(1), sig.get(sig.get(1)!), sig.get(sig.get(sig.get(1)!)!)].join('');
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  assert.equal(conteo.size, 6);
  for (const c of conteo.values()) assert.ok(Math.abs(c - vueltas / 6) < vueltas * 0.03, `frecuencia ${c}`);
});

test('reacomodar: solo cambia quien le regalaba a la baja y la ronda sigue siendo una', () => {
  for (let n = 4; n <= 15; n++) {
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    const antes = sortear(ids);
    const baja = ids[Math.floor(n / 2)];
    const { regalador, nuevoReceptor, resto } = reacomodar(antes, baja);

    assert.equal(regalador, antes.find((a) => a.receiver === baja)!.giver);
    assert.equal(nuevoReceptor, antes.find((a) => a.giver === baja)!.receiver);
    const quedan = ids.filter((id) => id !== baja);
    assert.ok(esUnaSolaRonda(quedan, resto));
    assert.ok(resto.every((a) => a.giver !== a.receiver));
    const cambiados = resto.filter((a) => {
      const previa = antes.find((b) => b.giver === a.giver)!;
      return previa.receiver !== a.receiver;
    });
    assert.deepEqual(cambiados, [{ giver: regalador, receiver: nuevoReceptor }]);
  }
});

test('reacomodar no deja un evento con menos de 3 ni acepta a alguien que no está', () => {
  const tres = sortear([1, 2, 3]);
  assert.throws(() => reacomodar(tres, 1), /menos de 3/);
  assert.throws(() => reacomodar(sortear([1, 2, 3, 4]), 9), /no está/);
});

test('rechaza menos de 3 participantes o ids repetidos', () => {
  assert.throws(() => sortear([1, 2]), /al menos 3/);
  assert.throws(() => sortear([1, 2, 2]), /repetidos/);
});

test('enteroAleatorio descarta los valores que sesgarían el resultado', () => {
  const valores = [2 ** 32 - 1, 7]; // el primero cae en el tramo descartado para max=10
  let i = 0;
  const falso = (buf: Uint32Array) => {
    buf[0] = valores[i++];
    return buf;
  };
  assert.equal(enteroAleatorio(10, falso), 7);
  assert.equal(i, 2);
});
