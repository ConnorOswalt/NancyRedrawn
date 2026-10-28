#include <stdio.h>

int probe_reset(int *value) {
  puts("CIF TREE synthetic NancyRedrawn validation fixture");
  *value = 0;
  return *value;
}

int main(void) {
  int value = 42;
  return probe_reset(&value);
}
